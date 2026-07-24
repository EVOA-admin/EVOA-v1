import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException, Optional, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Startup } from './entities/startup.entity';
import { StartupProfileVisit } from './entities/startup-profile-visit.entity';
import { Follow } from './entities/follow.entity';
import { Reel } from '../reels/entities/reel.entity';
import { User } from '../users/entities/user.entity';
import { Notification, NotificationType } from '../notifications/entities/notification.entity';
import { assertInvestorPaymentAccess } from '../users/user-access.util';

@Injectable()
export class StartupsService {
    constructor(
        @InjectRepository(Startup)
        private readonly startupRepository: Repository<Startup>,
        @InjectRepository(StartupProfileVisit)
        private readonly startupProfileVisitRepository: Repository<StartupProfileVisit>,
        @InjectRepository(Follow)
        private readonly followRepository: Repository<Follow>,
        @InjectRepository(Reel)
        private readonly reelRepository: Repository<Reel>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(Notification)
        private readonly notificationRepository: Repository<Notification>,
        @Optional() @Inject('REDIS_CLIENT')
        private readonly redisClient: any,
    ) { }

    async createStartup(userId: string, dto: any) {
        const verification = dto.verification || {};
        const normalizedCountryCode = typeof verification.countryCode === 'string'
            ? verification.countryCode.trim().toUpperCase()
            : '';
        const normalizedEntityType = typeof verification.entityType === 'string'
            ? verification.entityType.trim()
            : '';
        const normalizedPrimaryValue = typeof verification.value === 'string'
            ? verification.value.trim()
            : '';
        const normalizedSecondaryValue = typeof verification.secondaryValue === 'string'
            ? verification.secondaryValue.trim()
            : '';
        const normalizedDocumentUrl = typeof verification.documentUrl === 'string'
            ? verification.documentUrl.trim()
            : '';
        const isRegisteredEntity = !!normalizedEntityType && normalizedEntityType !== 'Not Registered Yet';

        if (dto.industries && (!Array.isArray(dto.industries) || dto.industries.length === 0)) {
            throw new BadRequestException('Please select at least one industry.');
        }
        if (dto.stage !== undefined && !dto.stage) {
            throw new BadRequestException('Please select the startup stage.');
        }

        if (normalizedCountryCode) {
            if (!normalizedEntityType) {
                throw new BadRequestException('Legal entity type is required.');
            }

            if (isRegisteredEntity && !normalizedDocumentUrl) {
                throw new BadRequestException('A registration document is required for registered entities.');
            }

            if (isRegisteredEntity && !normalizedPrimaryValue) {
                throw new BadRequestException('A primary registration number is required for registered entities.');
            }

            dto.verification = {
                ...verification,
                countryCode: normalizedCountryCode,
                entityType: normalizedEntityType,
                value: normalizedPrimaryValue,
                secondaryValue: normalizedSecondaryValue || null,
                documentUrl: normalizedDocumentUrl || null,
                registrationStatus: verification.registrationStatus
                    || (isRegisteredEntity ? 'registered' : 'unregistered'),
            };
        }

        // Check availability of username
        const existing = await this.startupRepository.findOne({
            where: { username: dto.username }
        });

        if (existing) {
            throw new ConflictException('Startup username already taken');
        }

        // Explicit field mapping — never spread the full DTO to avoid unknown field errors
        const startup = this.startupRepository.create({
            founderId: userId,
            name: dto.name,
            username: dto.username,
            tagline: dto.tagline || null,
            description: dto.description || dto.shortDescription || null,
            industry: dto.industries?.[0] || null,
            industries: dto.industries || [],
            stage: dto.stage || null,
            raisingAmount: dto.raisingAmount || null,
            equityPercentage: dto.equityPercentage || null,
            revenue: dto.revenue || null,
            website: dto.website || null,
            logoUrl: dto.logoUrl || null,
            location: dto.location || null,
            founders: dto.founders || [],
            verification: dto.verification || null,
            pitchVideoUrl: dto.pitchVideoUrl || null,
            pitchDeckUrl: dto.pitchDeckUrl || null,
            socialLinks: dto.socialLinks || null,
            teamMembers: dto.teamMembers || [],
            categoryTags: dto.categoryTags || [],
            hashtags: Array.isArray(dto.hashtags)
                ? dto.hashtags.map((t: string) => t.replace(/^#/, '').toLowerCase())
                : typeof dto.hashtags === 'string' && dto.hashtags.trim()
                    ? dto.hashtags.replace(/#/g, '').split(/[\s,]+/).filter(Boolean).map((t: string) => t.toLowerCase())
                    : [],
        });

        const saved = (await this.startupRepository.save(startup)) as unknown as Startup;

        // Sync the startup's name and logo back to the users table so story bubbles
        // and post headers show registration identity, not the Google email prefix.
        try {
            const userUpdate: Partial<User> = {};
            if (dto.name) userUpdate.fullName = dto.name;
            if (dto.logoUrl) userUpdate.avatarUrl = dto.logoUrl;
            if (Object.keys(userUpdate).length > 0) {
                await this.userRepository.update({ id: userId }, userUpdate);
            }
        } catch (err) {
            console.warn('[StartupsService] Failed to sync user profile fields:', err?.message);
        }

        // Auto-create a Reel from the pitch video so it appears in the feed immediately
        if (dto.pitchVideoUrl) {
            try {
                const hashtags: string[] = (startup.hashtags || []);
                if (startup.industries?.length) {
                    hashtags.push(...startup.industries.map((i: string) => i.toLowerCase().replace(/[\s/]+/g, '')));
                }

                const reel = this.reelRepository.create({
                    startupId: saved.id,
                    title: saved.name,
                    description: saved.description || '',
                    videoUrl: dto.pitchVideoUrl,
                    hashtags: [...new Set(hashtags)],
                });
                await this.reelRepository.save(reel);

                // Flush the for-you feed cache so the new reel is visible immediately
                try {
                    if (this.redisClient) {
                        const keys: string[] = [];
                        let cursor = 0;
                        do {
                            const result = await this.redisClient.scan(cursor, { MATCH: 'feed:for_you:*', COUNT: 100 });
                            cursor = result.cursor;
                            keys.push(...result.keys);
                        } while (cursor !== 0);
                        if (keys.length > 0) {
                            await this.redisClient.del(keys);
                        }
                    }
                } catch (e) {
                    console.warn('Could not flush feed cache:', e.message);
                }
            } catch (reelErr) {
                console.error('Failed to auto-create reel for startup:', reelErr.message);
                // Don't fail the whole registration — reel can be re-published via /startups/my/publish-reel
            }
        }

        return saved;
    }

    /**
     * Manually publish (or re-publish) the startup's pitch video as a Reel.
     * Safe to call multiple times — creates Reel if none exists, updates if it does.
     */
    async publishPitchReel(userId: string) {
        const startup = await this.startupRepository.findOne({
            where: { founderId: userId },
        });

        if (!startup) {
            throw new NotFoundException('Startup not found');
        }

        if (!startup.pitchVideoUrl) {
            throw new NotFoundException('No pitch video uploaded for this startup');
        }

        // Check if a reel already exists for this startup
        const existingReel = await this.reelRepository.findOne({
            where: { startupId: startup.id },
        });

        if (existingReel) {
            // Update existing reel with the current video URL
            existingReel.videoUrl = startup.pitchVideoUrl;
            existingReel.title = startup.name;
            existingReel.description = startup.description || '';
            await this.reelRepository.save(existingReel);
            return { message: 'Pitch reel updated', reelId: existingReel.id };
        }

        // Create a new reel
        const hashtags: string[] = [];
        if (startup.industries?.length) {
            hashtags.push(...startup.industries.map((i: string) => i.toLowerCase().replace(/[\s/]+/g, '')));
        }

        const reel = this.reelRepository.create({
            startupId: startup.id,
            title: startup.name,
            description: startup.description || '',
            videoUrl: startup.pitchVideoUrl,
            hashtags: [...new Set(hashtags)],
        });
        const saved = await this.reelRepository.save(reel);
        return { message: 'Pitch reel published', reelId: saved.id };
    }

    async getStartup(startupId: string, viewerId: string) {
        const viewer = await this.userRepository.findOne({ where: { id: viewerId } });
        assertInvestorPaymentAccess(viewer);

        const startup = await this.startupRepository.findOne({
            where: { id: startupId },
            relations: ['founder', 'reels'],
        });

        if (!startup) {
            throw new NotFoundException('Startup not found');
        }

        const isInvestor = viewer?.role === 'investor';
        const isOwner = startup.founderId === viewerId;
        if (!isInvestor && !isOwner) {
            startup.pitchDeckUrl = null as any;
        }

        return startup;
    }


    async getRankedStartups() {
        const startups = await this.startupRepository.find({
            where: { deletedAt: IsNull() },
            order: {
                followerCount: 'DESC',
                createdAt: 'ASC',
                name: 'ASC',
            },
        });

        return startups.map((startup, index) => ({
            startupId: startup.id,
            founderId: startup.founderId,
            name: startup.name || 'Startup',
            username: startup.username || null,
            logoUrl: startup.logoUrl || null,
            tagline: startup.tagline || null,
            trendingScore: Number(startup.followerCount || 0),
            metrics: {
                posts: 0,
                likes: 0,
                comments: 0,
                shares: 0,
                profileVisits: 0,
                activeDays: 0,
                supporters: Number(startup.followerCount || 0),
            },
            rank: index + 1,
        }));
    }

    async recordProfileVisit(startupId: string, visitorId: string) {
        const startup = await this.startupRepository.findOne({
            where: { id: startupId },
            select: ['id', 'founderId'],
        });
        if (!startup) throw new NotFoundException('Startup not found');
        if (startup.founderId === visitorId) {
            return { message: 'Own profile visits are ignored' };
        }

        const visitDate = new Date().toISOString().slice(0, 10);
        const existing = await this.startupProfileVisitRepository.findOne({
            where: { startupId, visitorId, visitDate },
        });

        if (!existing) {
            await this.startupProfileVisitRepository.save(
                this.startupProfileVisitRepository.create({ startupId, visitorId, visitDate }),
            );
        }

        return { message: 'Profile visit recorded' };
    }

    async getFollowStatus(startupId: string, userId: string) {
        const follow = await this.followRepository.findOne({
            where: { followerId: userId, startupId },
        });
        const supported = !!follow;
        return { isFollowing: supported, isSupported: supported };
    }

    /** Returns the list of users who support a startup */
    async getSupporters(startupId: string) {
        const follows = await this.followRepository.find({
            where: { startupId },
            relations: ['follower'],
            order: { createdAt: 'DESC' },
        });
        return follows.map(f => ({
            id: f.follower?.id,
            fullName: f.follower?.fullName,
            avatarUrl: f.follower?.avatarUrl,
            role: f.follower?.role,
            supportedAt: f.createdAt,
        }));
    }

    async followStartup(startupId: string, userId: string) {
        const startup = await this.startupRepository.findOne({ where: { id: startupId } });
        if (!startup) {
            throw new NotFoundException('Startup not found');
        }

        const existing = await this.followRepository.findOne({
            where: { followerId: userId, startupId },
        });

        if (existing) {
            throw new ConflictException('Already following this startup');
        }

        const follow = this.followRepository.create({
            followerId: userId,
            startupId,
        });

        await this.followRepository.save(follow);

        // Increment follower count
        await this.startupRepository.increment({ id: startupId }, 'followerCount', 1);

        // Notify startup founder about the new support
        this.userRepository.findOne({ where: { id: userId }, select: ['id', 'fullName'] })
            .then(follower => {
                if (follower && startup.founderId !== userId) {
                    this.notificationRepository.save(
                        this.notificationRepository.create({
                            userId: startup.founderId,
                            type: NotificationType.SYSTEM,
                            title: 'New Support 🤝',
                            message: `${follower.fullName || 'Someone'} just supported your startup!`,
                            link: `/u/${follower.id}`,
                            actorId: follower.id,
                        })
                    ).catch(() => { /* ignore */ });
                }
            })
            .catch(() => { /* ignore */ });

        return { message: 'Startup supported successfully' };
    }

    async unfollowStartup(startupId: string, userId: string) {
        const follow = await this.followRepository.findOne({
            where: { followerId: userId, startupId },
        });

        if (!follow) {
            throw new NotFoundException('Not supporting this startup');
        }

        await this.followRepository.remove(follow);

        // Decrement supporter count
        await this.startupRepository.decrement({ id: startupId }, 'followerCount', 1);

        return { message: 'Support removed successfully' };
    }

    async getMyStartup(userId: string) {
        return this.startupRepository.findOne({
            where: { founderId: userId },
            relations: ['founder', 'reels'],
        });
    }

    async updateStartup(userId: string, startupId: string, dto: any) {
        const startup = await this.startupRepository.findOne({
            where: { id: startupId, founderId: userId },
        });

        if (!startup) {
            throw new NotFoundException('Startup not found or you are not the owner');
        }

        // Check username uniqueness if being changed
        if (dto.username && dto.username !== startup.username) {
            const existing = await this.startupRepository.findOne({ where: { username: dto.username } });
            if (existing) throw new ConflictException('Username already taken');
        }

        Object.assign(startup, dto);
        return this.startupRepository.save(startup);
    }

    async getUserFollowedStartups(userId: string) {
        const follows = await this.followRepository.find({
            where: { followerId: userId },
            relations: ['startup', 'startup.founder'],
            order: { createdAt: 'DESC' },
        });

        return follows.map(f => f.startup);
    }
}
