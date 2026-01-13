import { Injectable, NotFoundException, ConflictException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThan, IsNull } from 'typeorm';
import { Reel } from './entities/reel.entity';
import { ReelLike } from './entities/reel-like.entity';
import { ReelComment } from './entities/reel-comment.entity';
import { ReelShare } from './entities/reel-share.entity';
import { Follow } from '../startups/entities/follow.entity';
import { RedisService } from '../config/redis.config';
import { FeedQueryDto, CreateCommentDto, ShareReelDto } from './dto/reels.dto';

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
        @InjectRepository(Follow)
        private readonly followRepository: Repository<Follow>,
        @Inject('REDIS_CLIENT')
        private readonly redisClient: any,
    ) { }

    private redisService = new RedisService(this.redisClient);

    /**
     * Get For You feed - Optimized with Redis caching
     * Target: < 200ms response time
     */
    async getForYouFeed(userId: string, query: FeedQueryDto) {
        const { cursor, limit = 20 } = query;
        const cacheKey = `feed:for_you:${userId}:${cursor || 'start'}:${limit}`;

        // Try cache first
        const cached = await this.redisService.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }

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

        const reels = await queryBuilder.getMany();

        // Check if there's a next page
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

        const result = {
            reels: reels.map(reel => ({
                ...reel,
                isLiked: likedReelIds.has(reel.id),
            })),
            nextCursor,
            hasMore,
        };

        // Cache for 5 minutes
        await this.redisService.set(cacheKey, JSON.stringify(result), 300);

        return result;
    }

    /**
     * Get Following feed - Shows reels from followed startups
     */
    async getFollowingFeed(userId: string, query: FeedQueryDto) {
        const { cursor, limit = 20 } = query;
        const cacheKey = `feed:following:${userId}:${cursor || 'start'}:${limit}`;

        // Try cache first
        const cached = await this.redisService.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }

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

        const result = {
            reels: reels.map(reel => ({
                ...reel,
                isLiked: likedReelIds.has(reel.id),
            })),
            nextCursor,
            hasMore,
        };

        // Cache for 5 minutes
        await this.redisService.set(cacheKey, JSON.stringify(result), 300);

        return result;
    }

    /**
     * Like a reel - Updates denormalized counter
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

        return { message: 'Reel liked successfully' };
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
        const reel = await this.reelRepository.findOne({ where: { id: reelId } });
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
     * Invalidate feed cache for user
     */
    private async invalidateFeedCache(userId: string) {
        // In production, you'd use Redis SCAN to find and delete all matching keys
        // For now, we'll just delete common cache keys
        const patterns = [
            `feed:for_you:${userId}:*`,
            `feed:following:${userId}:*`,
        ];

        // Note: This is simplified. In production, implement proper cache invalidation
    }
}
