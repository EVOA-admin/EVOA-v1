import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import { Post } from './entities/post.entity';
import { PostLike } from './entities/post-like.entity';
import { PostSave } from './entities/post-save.entity';
import { PostComment } from './entities/post-comment.entity';
import { PostWebsiteClick } from './entities/post-website-click.entity';
import { PostShare } from './entities/post-share.entity';
import { Startup } from '../startups/entities/startup.entity';
import { StartupProfileVisit } from '../startups/entities/startup-profile-visit.entity';
import { Reel } from '../reels/entities/reel.entity';
import { ReelLike } from '../reels/entities/reel-like.entity';
import { ReelComment } from '../reels/entities/reel-comment.entity';
import { ReelShare } from '../reels/entities/reel-share.entity';
import { ReelView } from '../reels/entities/reel-view.entity';
import { User } from '../users/entities/user.entity';
import { Notification, NotificationType } from '../notifications/entities/notification.entity';
import { CreatePostDto } from './dto/create-post.dto';

@Injectable()
export class PostsService {
    constructor(
        @InjectRepository(Post)
        private readonly postRepo: Repository<Post>,
        @InjectRepository(PostLike)
        private readonly postLikeRepo: Repository<PostLike>,
        @InjectRepository(PostSave)
        private readonly postSaveRepo: Repository<PostSave>,
        @InjectRepository(PostComment)
        private readonly postCommentRepo: Repository<PostComment>,
        @InjectRepository(PostWebsiteClick)
        private readonly clickRepo: Repository<PostWebsiteClick>,
        @InjectRepository(PostShare)
        private readonly postShareRepo: Repository<PostShare>,
        @InjectRepository(Startup)
        private readonly startupRepo: Repository<Startup>,
        @InjectRepository(StartupProfileVisit)
        private readonly startupProfileVisitRepo: Repository<StartupProfileVisit>,
        @InjectRepository(Reel)
        private readonly reelRepo: Repository<Reel>,
        @InjectRepository(ReelLike)
        private readonly reelLikeRepo: Repository<ReelLike>,
        @InjectRepository(ReelComment)
        private readonly reelCommentRepo: Repository<ReelComment>,
        @InjectRepository(ReelShare)
        private readonly reelShareRepo: Repository<ReelShare>,
        @InjectRepository(ReelView)
        private readonly reelViewRepo: Repository<ReelView>,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        @InjectRepository(Notification)
        private readonly notificationRepo: Repository<Notification>,
    ) { }

    // ────────────────────────────────────────────────── DELETE POST ──────────

    async deletePost(postId: string, userId: string) {
        const post = await this.postRepo.findOne({ where: { id: postId } });
        if (!post) throw new NotFoundException('Post not found');
        if (post.userId !== userId) {
            const { ForbiddenException } = await import('@nestjs/common');
            throw new ForbiddenException('You can only delete your own posts');
        }
        await this.postRepo.softDelete({ id: postId });
        return { message: 'Post deleted' };
    }

    // ─────────────────────────────────────────── RISING STARTUPS RANKING ─────

    async getRisingStartups() {
        const startups = await this.startupRepo.find({
            where: { deletedAt: IsNull() },
            order: { name: 'ASC' },
        });

        console.log('[RisingStartups] startups found:', startups.length);
        if (!startups.length) return [];

        const startupIds = startups.map((s) => s.id);

        // Build lookup: founderUserId → startupId (resolves posts with no startup_id column)
        const founderToStartupId = new Map<string, string>();
        const startupMap = new Map<string, any>();
        startups.forEach((startup) => {
            founderToStartupId.set(startup.founderId, startup.id);
            startupMap.set(startup.id, {
                startupId: startup.id,
                founderId: startup.founderId,
                name: startup.name || 'Startup',
                username: startup.username || null,
                logoUrl: startup.logoUrl || null,
                tagline: startup.tagline || null,
                postCount: 0,
                activeDays: new Set<string>(),
                likes: 0,
                comments: 0,
                shares: 0,
                profileVisits: 0,
            });
        });

        // Fetch posts (last 7 days) and ALL reels in parallel.
        // Reels have no date filter — engagement is date-filtered below so that
        // new likes/comments on older reels are still counted this week.
        const [allPostRows, allReelRows] = await Promise.all([
            this.postRepo
                .createQueryBuilder('post')
                .innerJoin('post.user', 'user')
                .select([
                    'post.id AS "postId"',
                    'post.user_id AS "userId"',
                    'post.startup_id AS "startupId"',
                    'post.created_at AS "createdAt"',
                    'post.like_count AS "likeCount"',
                    'post.comment_count AS "commentCount"',
                    'post.share_count AS "shareCount"',
                ])
                .where('post.deleted_at IS NULL')
                .andWhere("(post.startup_id IS NOT NULL OR user.role = 'startup')")
                .getRawMany(),

            this.reelRepo
                .createQueryBuilder('reel')
                .select([
                    'reel.id AS "reelId"',
                    'reel.startup_id AS "startupId"',
                    'reel.created_at AS "createdAt"',
                    'reel.like_count AS "likeCount"',
                    'reel.comment_count AS "commentCount"',
                    'reel.share_count AS "shareCount"',
                    'reel.view_count AS "viewCount"',
                ])
                .where('reel.deleted_at IS NULL')
                .andWhere('reel.startup_id IN (:...startupIds)', { startupIds })
                .getRawMany(),
        ]);

        // Build postId → startupId map and accumulate posting activity.
        const postToStartupId = new Map<string, string>();
        for (const post of allPostRows) {
            const resolvedId = post.startupId || founderToStartupId.get(post.userId);
            if (!resolvedId || !startupMap.has(resolvedId)) continue;
            postToStartupId.set(post.postId, resolvedId);
            const s = startupMap.get(resolvedId);
            s.postCount += 1;
            s.likes += Number(post.likeCount || 0);
            s.comments += Number(post.commentCount || 0);
            s.shares += Number(post.shareCount || 0);
            s.activeDays.add(new Date(post.createdAt).toISOString().slice(0, 10));
        }

        // Reels count toward postCount + activeDays + engagements
        for (const reel of allReelRows) {
            if (!reel.startupId || !startupMap.has(reel.startupId)) continue;
            const s = startupMap.get(reel.startupId);
            s.postCount += 1;
            s.likes += Number(reel.likeCount || 0);
            s.comments += Number(reel.commentCount || 0);
            s.shares += Number(reel.shareCount || 0);
            s.activeDays.add(new Date(reel.createdAt).toISOString().slice(0, 10));
        }

        // We only need profile visits since it's not cached on the startup entity
        const profileVisits = await this.startupProfileVisitRepo
            .createQueryBuilder('visit')
            .select('visit.startup_id', 'startupId')
            .addSelect('COUNT(visit.id)', 'count')
            .where('visit.startup_id IN (:...ids)', { ids: startupIds })
            .groupBy('visit.startup_id')
            .getRawMany();

        for (const row of profileVisits) {
            const s = startupMap.get(row.startupId);
            if (s) s.profileVisits += Number(row.count || 0);
        }

        // Score weights: posts×10 + likes×2 + comments×5 + shares×8 + profileVisits×3 + activeDays×5
        return Array.from(startupMap.values())
            .map((s) => {
                const activeDays = s.activeDays.size;
                const trendingScore =
                    (s.postCount * 10) +
                    (s.likes * 2) +
                    (s.comments * 5) +
                    (s.shares * 8) +
                    (s.profileVisits * 3) +
                    (activeDays * 5);
                return {
                    startupId: s.startupId,
                    founderId: s.founderId,
                    name: s.name,
                    username: s.username,
                    logoUrl: s.logoUrl,
                    tagline: s.tagline,
                    trendingScore,
                    metrics: {
                        posts: s.postCount,
                        likes: s.likes,
                        comments: s.comments,
                        shares: s.shares,
                        profileVisits: s.profileVisits,
                        activeDays,
                    },
                };
            })
            .sort((a, b) => {
                if (b.trendingScore !== a.trendingScore) return b.trendingScore - a.trendingScore;
                if (b.metrics.posts !== a.metrics.posts) return b.metrics.posts - a.metrics.posts;
                if (b.metrics.profileVisits !== a.metrics.profileVisits) return b.metrics.profileVisits - a.metrics.profileVisits;
                return a.name.localeCompare(b.name);
            })
            .map((s, index) => ({ ...s, rank: index + 1 }));
    }

    async getAllPosts(requestingUserId: string, limit = 50, offset = 0) {
        const posts = await this.postRepo.find({
            where: { deletedAt: IsNull() },
            relations: ['user'],
            order: { createdAt: 'DESC' },
            take: limit,
            skip: offset,
        });

        if (!posts.length) return [];

        const postIds = posts.map(p => p.id);

        // 1. Batch-fetch which posts this user has liked
        const likes = requestingUserId ? await this.postLikeRepo.find({
            where: postIds.map(id => ({ postId: id, userId: requestingUserId })),
        }) : [];
        const likedSet = new Set(likes.map(l => l.postId));

        // 2. Identify startup posts — either via direct startupId or user.role === 'startup'
        const startupPosts = posts.filter(p => p.startupId || p.user?.role === 'startup');
        const startupPostIds = startupPosts.map(p => p.id);

        // Collect all startup IDs we need to load
        const directStartupIds = [...new Set(posts.filter(p => p.startupId).map(p => p.startupId))];
        // For legacy posts (no startupId), look up by founderId
        const founderUserIds = [...new Set(
            posts
                .filter(p => !p.startupId && p.user?.role === 'startup')
                .map(p => p.userId),
        )];

        // Map startupId → startup record
        const startupByIdMap = new Map<string, Startup>();
        // Map founderId → startup record (for legacy posts)
        const startupByFounderMap = new Map<string, Startup>();

        if (directStartupIds.length) {
            const startups = await this.startupRepo.findBy({ id: In(directStartupIds) });
            startups.forEach(s => startupByIdMap.set(s.id, s));
        }
        if (founderUserIds.length) {
            const startups = await this.startupRepo.find({ where: founderUserIds.map(uid => ({ founderId: uid })) });
            startups.forEach(s => startupByFounderMap.set(s.founderId, s));
        }

        // All distinct startupIds for pitch-view counts
        const allStartupIds = [
            ...directStartupIds,
            ...[...startupByFounderMap.values()].map(s => s.id),
        ].filter(Boolean);

        // 3. Pitch views: count reel_views where viewer.role IN (investor, incubator)
        const pitchViewMap = new Map<string, number>(); // startupId → count
        if (allStartupIds.length) {
            const rows: { startupId: string; cnt: string }[] = await this.reelViewRepo
                .createQueryBuilder('rv')
                .innerJoin('rv.reel', 'reel')
                .innerJoin('rv.user', 'viewer')
                .select('reel.startup_id', 'startupId')
                .addSelect('COUNT(rv.id)', 'cnt')
                .where('reel.startup_id IN (:...sids)', { sids: allStartupIds })
                .andWhere('viewer.role IN (:...roles)', { roles: ['investor', 'incubator'] })
                .groupBy('reel.startup_id')
                .getRawMany();
            rows.forEach(r => pitchViewMap.set(r.startupId, parseInt(r.cnt, 10)));
        }

        // 4. Investor thoughts: latest 4 comments per startup post
        const thoughtsMap = new Map<string, { name: string; avatar: string }[]>(); // postId → avatars
        if (startupPostIds.length) {
            const thoughts = await this.postCommentRepo
                .createQueryBuilder('pc')
                .innerJoin('pc.user', 'u')
                .select([
                    'pc.post_id as "postId"',
                    'u.full_name as "name"',
                    'u.avatar_url as "avatar"',
                    'pc.created_at as "createdAt"',
                ])
                .where('pc.post_id IN (:...ids)', { ids: startupPostIds })
                .andWhere('u.role IN (:...roles)', { roles: ['investor', 'incubator'] })
                .andWhere('pc.deleted_at IS NULL')
                .orderBy('pc.created_at', 'DESC')
                .getRawMany();

            thoughts.forEach(t => {
                const arr = thoughtsMap.get(t.postId) || [];
                if (arr.length < 4) arr.push({ name: t.name, avatar: t.avatar });
                thoughtsMap.set(t.postId, arr);
            });
        }

        return posts.map(p => {
            const base = { ...p, isLiked: likedSet.has(p.id) };

            const isStartupPost = !!(p.startupId || p.user?.role === 'startup');
            if (!isStartupPost) return base;

            // Resolve startup data — either by startupId or by founderId (legacy posts)
            const startup = p.startupId
                ? startupByIdMap.get(p.startupId)
                : startupByFounderMap.get(p.userId);

            const resolvedStartupId = startup?.id;

            return {
                ...base,
                startupId: resolvedStartupId || p.startupId,
                startupName: startup?.name || p.user?.fullName,
                startupLogo: startup?.logoUrl || p.user?.avatarUrl || null,
                tagline: startup?.tagline || null,
                website: startup?.website || startup?.socialLinks?.website || null,
                sectors: startup?.industries?.length ? startup.industries : (startup?.categoryTags || []),
                pitchViews: resolvedStartupId ? (pitchViewMap.get(resolvedStartupId) ?? 0) : 0,
                supporters: startup?.followerCount ?? 0,
                clickThrough: p.clickThroughCount ?? 0,
                investorThoughts: thoughtsMap.get(p.id) || [],
            };
        });
    }

    async getPostById(postId: string, requestingUserId: string) {
        const post = await this.postRepo.findOne({
            where: { id: postId, deletedAt: IsNull() },
            relations: ['user'],
        });

        if (!post) {
            throw new NotFoundException('Post not found');
        }

        const [liked, startup] = await Promise.all([
            this.postLikeRepo.findOne({ where: { postId, userId: requestingUserId } }),
            post.startupId
                ? this.startupRepo.findOne({ where: { id: post.startupId } })
                : post.user?.role === 'startup'
                    ? this.startupRepo.findOne({ where: { founderId: post.userId } })
                    : Promise.resolve(null),
        ]);

        const basePost = { ...post, isLiked: !!liked };

        if (!startup) {
            return basePost;
        }

        return {
            ...basePost,
            startupId: startup.id,
            startupName: startup.name || post.user?.fullName,
            startupLogo: startup.logoUrl || post.user?.avatarUrl || null,
            tagline: startup.tagline || null,
            website: startup.website || startup.socialLinks?.website || null,
            sectors: startup.industries?.length ? startup.industries : (startup.categoryTags || []),
            pitchViews: 0,
            supporters: startup.followerCount ?? 0,
            clickThrough: post.clickThroughCount ?? 0,
            investorThoughts: [],
        };
    }

    // ───────────────────────────────────────────────────── CREATE POST ───────

    async createPost(userId: string, dto: CreatePostDto) {
        // If user is a startup founder, link the post to their startup
        let startupId: string | undefined;
        try {
            const startup = await this.startupRepo.findOne({ where: { founderId: userId } });
            if (startup) startupId = startup.id;
        } catch (_) { /* non-critical */ }

        // Normalise image fields:
        //   - imageUrls takes priority when supplied (multi-photo)
        //   - imageUrl is kept as the primary/first image for backwards compat
        const imageUrls = dto.imageUrls?.length
            ? dto.imageUrls
            : dto.imageUrl ? [dto.imageUrl] : [];
        const imageUrl = imageUrls[0] ?? dto.imageUrl ?? null;

        const post = this.postRepo.create({
            userId,
            ...(startupId ? { startupId } : {}),
            imageUrl,
            imageUrls,
            caption: dto.caption || '',
            hashtags: (dto.hashtags || []).map(h => h.replace(/^#/, '').toLowerCase()),
        });
        await this.postRepo.save(post);
        return { message: 'Post created', post };
    }

    // ──────────────────────────────────────────────────── MY / USER POSTS ───

    async getMyPosts(userId: string) {
        const posts = await this.postRepo.find({
            where: { userId, deletedAt: IsNull() },
            relations: ['user'],
            order: { createdAt: 'DESC' },
        });
        if (!posts.length) return [];
        const postIds = posts.map(p => p.id);
        const likes = await this.postLikeRepo.find({
            where: postIds.map(id => ({ postId: id, userId })),
        });
        const likedSet = new Set(likes.map(l => l.postId));
        return posts.map(p => ({ ...p, isLiked: likedSet.has(p.id) }));
    }

    async getUserPosts(userId: string, requestingUserId?: string) {
        const posts = await this.postRepo.find({
            where: { userId, deletedAt: IsNull() },
            relations: ['user'],
            order: { createdAt: 'DESC' },
        });
        if (!posts.length) return [];
        if (!requestingUserId) return posts.map(p => ({ ...p, isLiked: false }));
        const postIds = posts.map(p => p.id);
        const likes = await this.postLikeRepo.find({
            where: postIds.map(id => ({ postId: id, userId: requestingUserId })),
        });
        const likedSet = new Set(likes.map(l => l.postId));
        return posts.map(p => ({ ...p, isLiked: likedSet.has(p.id) }));
    }

    // ─────────────────────────────────────────────────────────── LIKES ───────

    async likePost(postId: string, userId: string) {
        const post = await this.postRepo.findOne({ where: { id: postId } });
        if (!post) throw new NotFoundException('Post not found');

        const existing = await this.postLikeRepo.findOne({ where: { postId, userId } });
        if (!existing) {
            await this.postLikeRepo.save(this.postLikeRepo.create({ postId, userId }));
            await this.postRepo.increment({ id: postId }, 'likeCount', 1);

            // Notify the post owner — skip if they liked their own post
            if (post.userId !== userId) {
                try {
                    const liker = await this.userRepo.findOne({ where: { id: userId } });
                    const likerName = liker?.fullName || liker?.email?.split('@')[0] || 'Someone';
                    await this.notificationRepo.save(
                        this.notificationRepo.create({
                            userId: post.userId,
                            type: NotificationType.PITCH,
                            title: 'New Like',
                            message: `${likerName} liked your post`,
                            link: `/post/${postId}`,
                            actorId: userId,
                        }),
                    );
                } catch (_) { /* non-critical — never block the like */ }
            }
        }
        return { message: 'Post liked' };
    }

    async unlikePost(postId: string, userId: string) {
        const post = await this.postRepo.findOne({ where: { id: postId } });
        if (!post) throw new NotFoundException('Post not found');

        const deleted = await this.postLikeRepo.delete({ postId, userId });
        if ((deleted.affected ?? 0) > 0 && post.likeCount > 0) {
            await this.postRepo.decrement({ id: postId }, 'likeCount', 1);
        }
        return { message: 'Post unliked' };
    }

    // ───────────────────────────────────────────────── WEBSITE CLICKTHROUGH ──

    /**
     * Record a unique website click for a post.
     * Idempotent — only counts the first click per user.
     */
    async recordWebsiteClick(postId: string, userId: string) {
        const post = await this.postRepo.findOne({ where: { id: postId } });
        if (!post) throw new NotFoundException('Post not found');

        const existing = await this.clickRepo.findOne({ where: { postId, userId } });
        if (!existing) {
            await this.clickRepo.save(this.clickRepo.create({ postId, userId }));
            await this.postRepo.increment({ id: postId }, 'clickThroughCount', 1);
        }
        return { message: 'Click recorded', clickThrough: post.clickThroughCount + (existing ? 0 : 1) };
    }

    /**
     * Record a post view — increments viewCount every time this post is opened.
     */
    async recordPostView(postId: string) {
        await this.postRepo.increment({ id: postId }, 'viewCount', 1);
        return { message: 'View recorded' };
    }

    async sharePost(postId: string, userId: string, platform = 'copy_link') {
        const post = await this.postRepo.findOne({ where: { id: postId, deletedAt: IsNull() } });
        if (!post) throw new NotFoundException('Post not found');

        const shareDate = new Date().toISOString().slice(0, 10);
        const existing = await this.postShareRepo.findOne({ where: { postId, userId, shareDate } });

        if (!existing) {
            await this.postShareRepo.save(this.postShareRepo.create({ postId, userId, platform, shareDate }));
            await this.postRepo.increment({ id: postId }, 'shareCount', 1);
        }

        return { message: 'Post shared', shareCount: post.shareCount + (existing ? 0 : 1) };
    }


    // ────────────────────────────────────────────────────────── COMMENTS ─────

    /**
     * Add a comment to a post. Any role can comment, but only investor/incubator
     * comments will be returned as "Investor's Thoughts" in the feed.
     */
    async addComment(postId: string, userId: string, content: string) {
        const post = await this.postRepo.findOne({ where: { id: postId } });
        if (!post) throw new NotFoundException('Post not found');
        if (!content?.trim()) throw new BadRequestException('Comment content cannot be empty');

        const comment = this.postCommentRepo.create({ postId, userId, content: content.trim() });
        await this.postCommentRepo.save(comment);
        await this.postRepo.increment({ id: postId }, 'commentCount', 1);

        // Notify the post owner — skip if they commented on their own post
        if (post.userId !== userId) {
            try {
                const commenter = await this.userRepo.findOne({ where: { id: userId } });
                const commenterName = commenter?.fullName || commenter?.email?.split('@')[0] || 'Someone';
                const preview = content.trim().length > 50
                    ? content.trim().slice(0, 50) + '…'
                    : content.trim();
                await this.notificationRepo.save(
                    this.notificationRepo.create({
                        userId: post.userId,
                        type: NotificationType.PITCH,
                        title: 'New Comment',
                        message: `${commenterName} commented: "${preview}"`,
                        link: `/post/${postId}`,
                        actorId: userId,
                    }),
                );
            } catch (_) { /* non-critical */ }
        }

        return { message: 'Comment added', comment };
    }

    /**
     * Get all comments on a post (public, all roles).
     * Each comment includes commenter user info.
     */
    async getComments(postId: string) {
        return this.postCommentRepo.find({
            where: { postId, deletedAt: IsNull() },
            relations: ['user'],
            order: { createdAt: 'ASC' },
        });
    }

    /**
     * Get ONLY investor/incubator comments — the "Investor's Thoughts" section.
     * Returns avatars + names for the summary bar.
     */
    async getInvestorThoughts(postId: string) {
        return this.postCommentRepo
            .createQueryBuilder('pc')
            .innerJoin('pc.user', 'u')
            .select([
                'pc.id as id',
                'pc.content as content',
                'pc.createdAt as "createdAt"',
                'u.id as "userId"',
                'u.fullName as name',
                'u.avatarUrl as avatar',
                'u.role as role',
            ])
            .where('pc.post_id = :postId', { postId })
            .andWhere('u.role IN (:...roles)', { roles: ['investor', 'incubator'] })
            .andWhere('pc.deleted_at IS NULL')
            .orderBy('pc.createdAt', 'DESC')
            .getRawMany();
    }

    // ────────────────────────────────────────────────────────────── SAVES ─────

    async savePost(postId: string, userId: string) {
        const post = await this.postRepo.findOne({ where: { id: postId } });
        if (!post) throw new NotFoundException('Post not found');

        const existing = await this.postSaveRepo.findOne({ where: { postId, userId } });
        if (existing) return { message: 'Already saved' };

        const save = this.postSaveRepo.create({ postId, userId });
        await this.postSaveRepo.save(save);
        return { message: 'Post saved', isSaved: true };
    }

    async unsavePost(postId: string, userId: string) {
        const save = await this.postSaveRepo.findOne({ where: { postId, userId } });
        if (!save) return { message: 'Not saved' };

        await this.postSaveRepo.delete({ id: save.id });
        return { message: 'Post unsaved', isSaved: false };
    }
}
