import { Injectable, NotFoundException, ConflictException, Inject, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThan, IsNull } from 'typeorm';
import { Reel } from './entities/reel.entity';
import { ReelLike } from './entities/reel-like.entity';
import { ReelComment } from './entities/reel-comment.entity';
import { ReelShare } from './entities/reel-share.entity';
import { ReelSave } from './entities/reel-save.entity';
import { ReelView } from './entities/reel-view.entity';
import { Follow } from '../startups/entities/follow.entity';
import { Startup } from '../startups/entities/startup.entity';
import { Notification, NotificationType } from '../notifications/entities/notification.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { RedisService } from '../config/redis.config';
import { FeedQueryDto, CreateCommentDto, ShareReelDto, CreateReelDto } from './dto/reels.dto';
import { assertInvestorPaymentAccess, hasActivePremiumAccess } from '../users/user-access.util';

@Injectable()
export class ReelsService {
    constructor(
        @InjectRepository(Reel)
        private readonly reelRepository: Repository<Reel>,
        @InjectRepository(ReelLike)
        private readonly reelLikeRepository: Repository<ReelLike>,
        @InjectRepository(ReelComment)
        private readonly reelCommentRepository: Repository<ReelComment>,
        @InjectRepository(ReelShare)
        private readonly reelShareRepository: Repository<ReelShare>,
        @InjectRepository(ReelSave)
        private readonly reelSaveRepository: Repository<ReelSave>,
        @InjectRepository(ReelView)
        private readonly reelViewRepository: Repository<ReelView>,
        @InjectRepository(Follow)
        private readonly followRepository: Repository<Follow>,
        @InjectRepository(Startup)
        private readonly startupRepository: Repository<Startup>,
        @InjectRepository(Notification)
        private readonly notificationRepository: Repository<Notification>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @Inject('REDIS_CLIENT')
        private readonly redisClient: any,
    ) { }

    private redisService = new RedisService(this.redisClient);

    private async getFreshUser(userId: string) {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');

        if (user.subscriptionEndDate && new Date(user.subscriptionEndDate).getTime() <= Date.now() && user.isPremium) {
            user.isPremium = false;
            user.subscriptionStatus = 'expired' as any;
            await this.userRepository.update(
                { id: user.id },
                {
                    isPremium: false,
                    subscriptionStatus: 'expired' as any,
                },
            );
        }

        return user;
    }

    /**
     * Create a new reel for the current user's startup.
     * Each upload always creates a fresh reel — users can have unlimited reels.
     * The feed is ordered by createdAt DESC so newest always appears first.
     */
    async createOrUpdateReel(userId: string, dto: CreateReelDto) {
        const user = await this.getFreshUser(userId);
        const startup = await this.startupRepository.findOne({ where: { founderId: userId } });
        if (!startup) throw new NotFoundException('Startup not found for this user');

        const pitchCount = await this.reelRepository.count({ where: { startupId: startup.id } });
        if (pitchCount >= 1 && !hasActivePremiumAccess(user)) {
            throw new ForbiddenException('Upgrade required');
        }

        const hashtags = [...new Set([
            ...(dto.hashtags || []).map(t => t.replace(/^#/, '').toLowerCase()),
            ...(startup.industries || []).map(i => i.toLowerCase().replace(/[\s/]+/g, '')),
        ])];

        // Always create a brand-new reel — never overwrite an existing one
        const reel = this.reelRepository.create({
            startupId: startup.id,
            title: dto.title || startup.name,
            description: dto.description || startup.description || '',
            videoUrl: dto.videoUrl,
            hashtags,
        });
        await this.reelRepository.save(reel);

        // Invalidate the uploader's own cache AND all other users' for_you feeds
        // so the new reel appears immediately on the public feed for everyone.
        await this.invalidateFeedCache(userId);
        await this.invalidateAllForYouCaches();

        return { message: 'Reel created', reelId: reel.id };
    }

    async getPitchCount(userId: string) {
        const user = await this.getFreshUser(userId);
        const startup = await this.startupRepository.findOne({ where: { founderId: userId } });
        if (!startup) {
            return { pitchCount: 0, isPremium: hasActivePremiumAccess(user) };
        }

        const pitchCount = await this.reelRepository.count({ where: { startupId: startup.id } });
        return { pitchCount, isPremium: hasActivePremiumAccess(user) };
    }

    /** Fetch a single reel by its ID. Used by the explore top-pitch click-through. */
    async getReelById(reelId: string, _userId: string) {
        const viewer = await this.getFreshUser(_userId);
        assertInvestorPaymentAccess(viewer);
        const reel = await this.reelRepository.findOne({
            where: { id: reelId },
            relations: ['startup', 'startup.founder'],
        });
        if (!reel) throw new NotFoundException('Reel not found');

        const isInvestor = viewer.role === UserRole.INVESTOR;
        const isOwn = reel.startup?.founderId === _userId;
        if (!isInvestor && !isOwn && reel.startup) {
            reel.startup.pitchDeckUrl = null as any;
        }

        return reel;
    }

    /**
     * Get For You feed - Optimized with Redis caching
     * Target: < 200ms response time
     */
    async getForYouFeed(userId: string, query: FeedQueryDto) {
        const { cursor, limit = 20 } = query;
        const cacheKey = `feed:for_you:${userId}:${cursor || 'start'}:${limit}`;

        // Try cache first — but never let Redis errors crash the feed
        try {
            const cached = await this.redisService.get(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                // Only use cache if it has actual reels (don't serve empty cached responses)
                if (parsed?.reels?.length > 0) return parsed;
            }
        } catch (_) { /* Redis unavailable — proceed to DB */ }

        const user = await this.getFreshUser(userId);
        const isInvestor = user.role === UserRole.INVESTOR;

        // Build query with cursor-based pagination
        const queryBuilder = this.reelRepository
            .createQueryBuilder('reel')
            .leftJoinAndSelect('reel.startup', 'startup')
            .leftJoinAndSelect('startup.founder', 'founder')
            .where('reel.deletedAt IS NULL')
            .orderBy('reel.createdAt', 'DESC')
            .take(limit + 1);

        if (cursor) {
            queryBuilder.andWhere('reel.createdAt < :cursor', { cursor: new Date(cursor) });
        }

        // Filter by hashtag if provided
        if (query.hashtag) {
            const tag = query.hashtag.toLowerCase().replace(/^#/, '');
            queryBuilder.andWhere('reel.hashtags @> ARRAY[:tag]::text[]', { tag });
        }

        const reels = await queryBuilder.getMany();
        console.log(`[ReelsService] getForYouFeed: found ${reels.length} reels for user ${userId}`);

        // Check if there's a next page
        const hasMore = reels.length > limit;
        if (hasMore) reels.pop();

        const nextCursor = hasMore && reels.length > 0
            ? reels[reels.length - 1].createdAt.toISOString()
            : null;

        // Check likes / saves / follows — guard against empty arrays
        const reelIds = reels.map(r => r.id);
        const startupIds = [...new Set(reels.map(r => r.startupId))];

        const [userLikes, userSaves, userFollows] = await Promise.all([
            reelIds.length > 0
                ? this.reelLikeRepository.find({ where: { userId, reelId: In(reelIds) } })
                : Promise.resolve([]),
            reelIds.length > 0
                ? this.reelSaveRepository.find({ where: { userId, reelId: In(reelIds) } })
                : Promise.resolve([]),
            startupIds.length > 0
                ? this.followRepository.find({ where: { followerId: userId, startupId: In(startupIds) } })
                : Promise.resolve([]),
        ]);

        const likedReelIds = new Set(userLikes.map(l => l.reelId));
        const savedReelIds = new Set(userSaves.map(s => s.reelId));
        const followedStartupIds = new Set(userFollows.map(f => f.startupId));

        const result = {
            reels: reels.map(reel => {
                const isOwn = reel.startup?.founderId === userId;
                const canAccessDeck = isInvestor || isOwn;
                return {
                    ...reel,
                    startup: reel.startup ? {
                        ...reel.startup,
                        pitchDeckUrl: canAccessDeck ? reel.startup.pitchDeckUrl : null,
                    } : null,
                    isLiked: likedReelIds.has(reel.id),
                    isSaved: savedReelIds.has(reel.id),
                    isFollowing: followedStartupIds.has(reel.startupId),
                };
            }),
            nextCursor,
            hasMore,
        };

        // Cache for 5 minutes — but don't let cache failure break the response
        if (result.reels.length > 0) {
            try {
                await this.redisService.set(cacheKey, JSON.stringify(result), 300);
            } catch (_) { /* Redis unavailable — continue without caching */ }
        }

        return result;
    }

    /**
     * Get Following feed - Shows reels from followed startups
     */
    async getFollowingFeed(userId: string, query: FeedQueryDto) {
        const { cursor, limit = 20 } = query;
        const cacheKey = `feed:following:${userId}:${cursor || 'start'}:${limit}`;

        // Try cache first — but never let Redis errors crash the feed,
        // and never serve a cached empty result (prevents empty-result poisoning).
        try {
            const cached = await this.redisService.get(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                // Only use cache if it contains actual reels.
                if (parsed?.reels?.length > 0) return parsed;
            }
        } catch (_) { /* Redis unavailable — proceed to DB */ }

        const user = await this.getFreshUser(userId);
        const isInvestor = user.role === UserRole.INVESTOR;

        // Get followed startup IDs
        const follows = await this.followRepository.find({
            where: { followerId: userId },
            select: ['startupId'],
        });

        const followedStartupIds = follows.map(f => f.startupId);

        if (followedStartupIds.length === 0) {
            return { reels: [], nextCursor: null, hasMore: false };
        }

        // Build query
        const queryBuilder = this.reelRepository
            .createQueryBuilder('reel')
            .leftJoinAndSelect('reel.startup', 'startup')
            .leftJoinAndSelect('startup.founder', 'founder')
            .where('reel.startupId IN (:...startupIds)', { startupIds: followedStartupIds })
            .andWhere('reel.deletedAt IS NULL')
            .orderBy('reel.createdAt', 'DESC')
            .take(limit + 1);

        if (cursor) {
            queryBuilder.andWhere('reel.createdAt < :cursor', { cursor: new Date(cursor) });
        }

        const reels = await queryBuilder.getMany();

        const hasMore = reels.length > limit;
        if (hasMore) {
            reels.pop();
        }

        const nextCursor = hasMore && reels.length > 0
            ? reels[reels.length - 1].createdAt.toISOString()
            : null;

        // Check if user liked each reel
        const reelIds = reels.map(r => r.id);
        const userLikes = await this.reelLikeRepository.find({
            where: { userId, reelId: In(reelIds) },
        });
        const likedReelIds = new Set(userLikes.map(like => like.reelId));

        // Check if user saved each reel
        const userSaves = await this.reelSaveRepository.find({
            where: { userId, reelId: In(reelIds) },
        });
        const savedReelIds = new Set(userSaves.map(save => save.reelId));

        const result = {
            reels: reels.map(reel => {
                const isOwn = reel.startup?.founderId === userId;
                const canAccessDeck = isInvestor || isOwn;
                return {
                    ...reel,
                    startup: reel.startup ? {
                        ...reel.startup,
                        pitchDeckUrl: canAccessDeck ? reel.startup.pitchDeckUrl : null,
                    } : null,
                    isLiked: likedReelIds.has(reel.id),
                    isSaved: savedReelIds.has(reel.id),
                    isFollowing: true,
                };
            }),
            nextCursor,
            hasMore,
        };

        // Cache for 1 minute — shorter TTL than for_you to limit stale-empty window.
        if (result.reels.length > 0) {
            try {
                await this.redisService.set(cacheKey, JSON.stringify(result), 60);
            } catch (_) { /* Redis unavailable — continue without caching */ }
        }

        return result;
    }

    /**
     * Like / Support a reel — Updates denormalized counter + notifies startup owner
     */
    async likeReel(reelId: string, userId: string) {
        // Check if already liked
        const existing = await this.reelLikeRepository.findOne({
            where: { reelId, userId },
        });

        if (existing) {
            throw new ConflictException('Reel already liked');
        }

        // Create like
        const like = this.reelLikeRepository.create({ reelId, userId });
        await this.reelLikeRepository.save(like);

        // Increment counter
        await this.reelRepository.increment({ id: reelId }, 'likeCount', 1);

        // Invalidate cache
        await this.invalidateFeedCache(userId);

        // Notify startup owner — fire and forget (don't block response)
        this.reelRepository
            .findOne({ where: { id: reelId }, relations: ['startup'] })
            .then(async (reel) => {
                if (reel?.startup?.founderId && reel.startup.founderId !== userId) {
                    await this.notificationRepository.save(
                        this.notificationRepository.create({
                            userId: reel.startup.founderId,
                            type: NotificationType.PITCH,
                            title: 'Someone supported your pitch! 🤝',
                            message: `Your pitch "${reel.title || reel.startup.name}" just received a new support.`,
                            link: `/pitch/${reelId}`,
                            actorId: userId,
                        }),
                    );
                }
            })
            .catch(() => { /* silently ignore notification errors */ });

        return { message: 'Reel supported successfully' };
    }

    /**
     * Unlike a reel
     */
    async unlikeReel(reelId: string, userId: string) {
        const like = await this.reelLikeRepository.findOne({
            where: { reelId, userId },
        });

        if (!like) {
            throw new NotFoundException('Like not found');
        }

        await this.reelLikeRepository.remove(like);

        // Decrement counter
        await this.reelRepository.decrement({ id: reelId }, 'likeCount', 1);

        // Invalidate cache
        await this.invalidateFeedCache(userId);

        return { message: 'Reel unliked successfully' };
    }

    /**
     * Comment on a reel
     */
    async commentOnReel(reelId: string, userId: string, dto: CreateCommentDto) {
        const reel = await this.reelRepository.findOne({ where: { id: reelId }, relations: ['startup'] });
        if (!reel) {
            throw new NotFoundException('Reel not found');
        }

        const comment = this.reelCommentRepository.create({
            reelId,
            userId,
            content: dto.content,
            parentCommentId: dto.parentCommentId,
        });

        await this.reelCommentRepository.save(comment);

        // Increment counter
        await this.reelRepository.increment({ id: reelId }, 'commentCount', 1);

        // Notify startup owner
        if (reel.startup?.founderId && reel.startup.founderId !== userId) {
            this.userRepository.findOne({ where: { id: userId }, select: ['id', 'fullName'] })
                .then(commenter => {
                    if (commenter) {
                        this.notificationRepository.save(
                            this.notificationRepository.create({
                                userId: reel.startup.founderId,
                                type: NotificationType.PITCH,
                                title: 'New Comment 💬',
                                message: `${commenter.fullName || 'Someone'} commented on your pitch: "${dto.content.substring(0, 30)}${dto.content.length > 30 ? '...' : ''}"`,
                                link: `/pitch/${reelId}`,
                                actorId: userId,
                            })
                        ).catch(() => { /* ignore */ });
                    }
                })
                .catch(() => { /* ignore */ });
        }

        return comment;
    }

    /**
     * Share a reel
     */
    async shareReel(reelId: string, userId: string, dto: ShareReelDto) {
        const reel = await this.reelRepository.findOne({ where: { id: reelId } });
        if (!reel) {
            throw new NotFoundException('Reel not found');
        }

        const share = this.reelShareRepository.create({
            reelId,
            userId,
            platform: dto.platform,
        });

        await this.reelShareRepository.save(share);

        // Increment counter
        await this.reelRepository.increment({ id: reelId }, 'shareCount', 1);

        return { message: 'Reel shared successfully' };
    }

    /**
     * Save/bookmark a reel
     */
    async saveReel(reelId: string, userId: string) {
        const user = await this.getFreshUser(userId);
        assertInvestorPaymentAccess(user);

        // Check if reel exists
        const reel = await this.reelRepository.findOne({ where: { id: reelId } });
        if (!reel) {
            throw new NotFoundException('Reel not found');
        }

        // Check if already saved
        const existingSave = await this.reelSaveRepository.findOne({
            where: { reelId, userId },
        });

        if (existingSave) {
            throw new ConflictException('Reel already saved');
        }

        const save = this.reelSaveRepository.create({
            reelId,
            userId,
        });

        await this.reelSaveRepository.save(save);

        return { message: 'Reel saved successfully' };
    }

    /**
     * Unsave/unbookmark a reel
     */
    async unsaveReel(reelId: string, userId: string) {
        const save = await this.reelSaveRepository.findOne({
            where: { reelId, userId },
        });

        if (!save) {
            throw new NotFoundException('Save not found');
        }

        await this.reelSaveRepository.remove(save);

        return { message: 'Reel unsaved successfully' };
    }

    /**
     * Track a view on a reel
     */
    async trackView(reelId: string, userId: string) {
        // Check if reel exists
        const reel = await this.reelRepository.findOne({ where: { id: reelId } });
        if (!reel) {
            throw new NotFoundException('Reel not found');
        }

        // Keep a unique-view record for analytics, but always increment the
        // denormalized counter so the UI reflects total view opens from now on.
        const existingView = await this.reelViewRepository.findOne({
            where: { reelId, userId },
        });

        if (!existingView) {
            const view = this.reelViewRepository.create({
                reelId,
                userId,
            });

            await this.reelViewRepository.save(view);
        }

        // Increment view counter
        await this.reelRepository.increment({ id: reelId }, 'viewCount', 1);
        await this.invalidateTopPitchesCache();

        return { message: 'View tracked successfully' };
    }

    /**
     * Get all reels uploaded by the current user's startup (for profile Posts tab)
     */
    async getMyReels(userId: string) {
        const startup = await this.startupRepository.findOne({ where: { founderId: userId } });
        if (!startup) return [];
        return this.reelRepository.find({
            where: { startupId: startup.id, deletedAt: IsNull() },
            order: { createdAt: 'DESC' },
        });
    }

    /**
     * Delete a reel — only the startup founder can delete their own reel
     */
    async deleteReel(reelId: string, userId: string) {
        const startup = await this.startupRepository.findOne({ where: { founderId: userId } });
        if (!startup) {
            const { NotFoundException } = await import('@nestjs/common');
            throw new NotFoundException('Startup not found for this user');
        }
        const reel = await this.reelRepository.findOne({ where: { id: reelId, startupId: startup.id } });
        if (!reel) {
            const { NotFoundException } = await import('@nestjs/common');
            throw new NotFoundException('Reel not found or not owned by this startup');
        }
        if (startup.selectedBattlegroundReelId === reelId) {
            await this.startupRepository.update(
                { id: startup.id },
                { selectedBattlegroundReelId: null },
            );
        }
        await this.reelRepository.softDelete({ id: reelId });
        await this.invalidateAllForYouCaches();
        return { message: 'Reel deleted' };
    }

    /**
     * Get reel comments
     */
    async getReelComments(reelId: string) {
        return this.reelCommentRepository.find({
            where: { reelId, parentCommentId: IsNull(), deletedAt: IsNull() },
            relations: ['user'],
            order: { createdAt: 'DESC' },
        });
    }

    /**
     * Invalidate feed cache for user.
     *
     * Two-phase approach for reliability:
     *  1. Direct DEL on the most common first-page key (fast, always works).
     *  2. SCAN-based sweep for any paginated variants.
     *
     * Uses redis v4 client API — scan(cursor, { MATCH, COUNT }) returning { cursor, keys }.
     */
    private async invalidateFeedCache(userId: string) {
        try {
            if (!this.redisClient) return;

            // ── Phase 1: Fast-path — delete the first-page key directly ─────────
            // This covers the overwhelmingly common case (no cursor / limit=20).
            const firstPageKeys = [
                `feed:for_you:${userId}:start:20`,
                `feed:for_you:${userId}:start:10`,
                `feed:following:${userId}:start:20`,
                `feed:following:${userId}:start:10`,
            ];
            await this.redisClient.del(firstPageKeys).catch(() => { /* ignore */ });

            // ── Phase 2: SCAN sweep for paginated cache keys ──────────────────────
            // redis v4 API: scan(cursor, { MATCH, COUNT }) → { cursor, keys }
            const patterns = [
                `feed:for_you:${userId}:*`,
                `feed:following:${userId}:*`,
            ];

            for (const pattern of patterns) {
                let cursor = 0;
                do {
                    const result = await this.redisClient.scan(cursor, {
                        MATCH: pattern,
                        COUNT: 100,
                    });
                    cursor = result.cursor;
                    if (result.keys.length > 0) {
                        await this.redisClient.del(result.keys);
                    }
                } while (cursor !== 0);
            }
        } catch (err) {
            console.error('[ReelsService] Cache invalidation error:', err);
        }
    }

    /**
     * Wipe ALL users' for_you AND following feed caches so a newly published reel
     * appears immediately for every user — both on the For You page and on the
     * Following feed of anyone who follows the uploader's startup.
     *
     * Root-cause fix for "No Pitches Yet" bug: the original implementation only
     * cleared feed:for_you:* keys, leaving feed:following:* caches stale. A follower
     * who already had a cached (possibly empty) following feed would not see the
     * new pitch until the 5-minute TTL expired — or until backend restart flushed Redis.
     *
     * Uses redis v4 client API — scan(cursor, { MATCH, COUNT }) returning { cursor, keys }.
     */
    private async invalidateAllForYouCaches() {
        try {
            if (!this.redisClient) return;

            // Fast-path: delete the most common first-page following keys directly
            // (these are the keys most likely to be stale after a new pitch upload)
            const commonKeys = [
                // We can't enumerate all user IDs here, so rely on SCAN below.
                // But we DO know the for_you first-page keys to bust immediately:
            ];
            if (commonKeys.length > 0) {
                await this.redisClient.del(commonKeys).catch(() => { /* ignore */ });
            }

            // SCAN-based sweep for both feed types
            const patterns = ['feed:for_you:*', 'feed:following:*'];

            for (const pattern of patterns) {
                let cursor = 0;
                do {
                    const result = await this.redisClient.scan(cursor, {
                        MATCH: pattern,
                        COUNT: 200,
                    });
                    cursor = result.cursor;
                    if (result.keys.length > 0) {
                        await this.redisClient.del(result.keys);
                    }
                } while (cursor !== 0);
            }
        } catch (err) {
            console.error('[ReelsService] Global feed cache flush error:', err);
        }
    }

    private async invalidateTopPitchesCache() {
        try {
            await this.redisService.del('top:pitches');
        } catch (err) {
            console.error('[ReelsService] Top pitches cache flush error:', err);
        }
    }
}
