import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In } from 'typeorm';
import { Startup } from '../startups/entities/startup.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { Reel } from '../reels/entities/reel.entity';
import { Hashtag } from './entities/hashtag.entity';
import { RedisService } from '../config/redis.config';

@Injectable()
export class ExploreService {
    constructor(
        @InjectRepository(Startup)
        private readonly startupRepository: Repository<Startup>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(Reel)
        private readonly reelRepository: Repository<Reel>,
        @InjectRepository(Hashtag)
        private readonly hashtagRepository: Repository<Hashtag>,
        @Inject('REDIS_CLIENT')
        private readonly redisClient: any,
    ) { }

    private redisService = new RedisService(this.redisClient);

    async search(query: string, type: 'startups' | 'investors' | 'hashtags' = 'startups') {
        const cacheKey = `search:${type}:${query}`;
        const cached = await this.redisService.get(cacheKey);

        if (cached) {
            return JSON.parse(cached);
        }

        let results;

        switch (type) {
            case 'startups':
                results = await this.startupRepository.find({
                    where: [
                        { name: Like(`%${query}%`) },
                        { description: Like(`%${query}%`) },
                        { industry: Like(`%${query}%`) },
                    ],
                    relations: ['founder'],
                    take: 20,
                });
                break;

            case 'investors':
                results = await this.userRepository.find({
                    where: [
                        { role: In([UserRole.INVESTOR, UserRole.INCUBATOR]) },
                        { fullName: Like(`%${query}%`) },
                    ],
                    take: 20,
                });
                break;

            case 'hashtags':
                results = await this.hashtagRepository.find({
                    where: { tag: Like(`%${query}%`) },
                    order: { usageCount: 'DESC' },
                    take: 20,
                });
                break;
        }

        // Cache for 10 minutes
        await this.redisService.set(cacheKey, JSON.stringify(results), 600);

        return results;
    }

    async getTrendingHashtags() {
        const cacheKey = 'trending:hashtags';
        const cached = await this.redisService.get(cacheKey);

        if (cached) {
            return JSON.parse(cached);
        }

        const hashtags = await this.hashtagRepository.find({
            order: { usageCount: 'DESC' },
            take: 20,
        });

        // Cache for 15 minutes
        await this.redisService.set(cacheKey, JSON.stringify(hashtags), 900);

        return hashtags;
    }

    async getTopStartups() {
        const cacheKey = 'top:startups';
        const cached = await this.redisService.get(cacheKey);

        if (cached) {
            return JSON.parse(cached);
        }

        const startups = await this.startupRepository.find({
            relations: ['founder', 'reels'],
            order: { followerCount: 'DESC' },
            take: 20,
        });

        // Cache for 30 minutes
        await this.redisService.set(cacheKey, JSON.stringify(startups), 1800);

        return startups;
    }

    async getStartupsOfTheWeek() {
        const cacheKey = 'startups:week';
        const cached = await this.redisService.get(cacheKey);

        if (cached) {
            return JSON.parse(cached);
        }

        // Get startups created in the last 7 days, sorted by follower count
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        const startups = await this.startupRepository
            .createQueryBuilder('startup')
            .leftJoinAndSelect('startup.founder', 'founder')
            .leftJoinAndSelect('startup.reels', 'reels')
            .where('startup.createdAt >= :date', { date: oneWeekAgo })
            .orderBy('startup.followerCount', 'DESC')
            .take(10)
            .getMany();

        // Cache for 1 hour
        await this.redisService.set(cacheKey, JSON.stringify(startups), 3600);

        return startups;
    }

    async getInvestorSpotlight() {
        const cacheKey = 'investors:spotlight';
        const cached = await this.redisService.get(cacheKey);

        if (cached) {
            return JSON.parse(cached);
        }

        const investors = await this.userRepository.find({
            where: { role: In([UserRole.INVESTOR, UserRole.INCUBATOR]) },
            take: 10,
        });

        // Cache for 1 hour
        await this.redisService.set(cacheKey, JSON.stringify(investors), 3600);

        return investors;
    }

    async getLiveBattleground() {
        const cacheKey = 'battleground:live';
        const cached = await this.redisService.get(cacheKey);

        if (cached) {
            return JSON.parse(cached);
        }

        // Get featured reels or top performing reels
        const reels = await this.reelRepository.find({
            where: { isFeatured: true },
            relations: ['startup', 'startup.founder'],
            order: { likeCount: 'DESC' },
            take: 10,
        });

        // Cache for 5 minutes
        await this.redisService.set(cacheKey, JSON.stringify(reels), 300);

        return reels;
    }
}
