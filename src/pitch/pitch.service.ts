import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reel } from '../reels/entities/reel.entity';
import { Startup } from '../startups/entities/startup.entity';

@Injectable()
export class PitchService {
    constructor(
        @InjectRepository(Reel)
        private readonly reelRepository: Repository<Reel>,
        @InjectRepository(Startup)
        private readonly startupRepository: Repository<Startup>,
    ) { }

    async getPitchDetails(reelId: string) {
        const reel = await this.reelRepository.findOne({
            where: { id: reelId },
            relations: ['startup', 'startup.founder'],
        });

        if (!reel) {
            throw new NotFoundException('Pitch not found');
        }

        return {
            reel,
            startup: reel.startup,
            founder: reel.startup.founder,
        };
    }

    async getStartupPitch(startupId: string) {
        const startup = await this.startupRepository.findOne({
            where: { id: startupId },
            relations: ['founder', 'reels'],
        });

        if (!startup) {
            throw new NotFoundException('Startup not found');
        }

        return startup;
    }
}
