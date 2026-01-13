import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PitchController } from './pitch.controller';
import { PitchService } from './pitch.service';
import { Reel } from '../reels/entities/reel.entity';
import { Startup } from '../startups/entities/startup.entity';
import { AiModule } from '../ai/ai.module';
import { MeetingsModule } from '../meetings/meetings.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Reel, Startup]),
        AiModule,
        MeetingsModule,
    ],
    controllers: [PitchController],
    providers: [PitchService],
})
export class PitchModule { }
