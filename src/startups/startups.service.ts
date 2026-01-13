import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Startup } from './entities/startup.entity';
import { Follow } from './entities/follow.entity';

@Injectable()
export class StartupsService {
    constructor(
        @InjectRepository(Startup)
        private readonly startupRepository: Repository<Startup>,
        @InjectRepository(Follow)
        private readonly followRepository: Repository<Follow>,
    ) { }

    async getStartup(startupId: string) {
        const startup = await this.startupRepository.findOne({
            where: { id: startupId },
            relations: ['founder', 'reels'],
        });

        if (!startup) {
            throw new NotFoundException('Startup not found');
        }

        return startup;
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

        return { message: 'Startup followed successfully' };
    }

    async unfollowStartup(startupId: string, userId: string) {
        const follow = await this.followRepository.findOne({
            where: { followerId: userId, startupId },
        });

        if (!follow) {
            throw new NotFoundException('Not following this startup');
        }

        await this.followRepository.remove(follow);

        // Decrement follower count
        await this.startupRepository.decrement({ id: startupId }, 'followerCount', 1);

        return { message: 'Startup unfollowed successfully' };
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
