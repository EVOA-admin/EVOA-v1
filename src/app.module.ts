import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { dataSourceOptions } from './config/database.config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ReelsModule } from './reels/reels.module';
import { PitchModule } from './pitch/pitch.module';
import { AiModule } from './ai/ai.module';
import { MeetingsModule } from './meetings/meetings.module';
import { StartupsModule } from './startups/startups.module';
import { ExploreModule } from './explore/explore.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: '.env',
        }),
        TypeOrmModule.forRoot(dataSourceOptions),
        ThrottlerModule.forRoot([
            {
                ttl: parseInt(process.env.RATE_LIMIT_TTL || '60000', 10),
                limit: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
            },
        ]),
        AuthModule,
        UsersModule,
        ReelsModule,
        PitchModule,
        AiModule,
        MeetingsModule,
        StartupsModule,
        ExploreModule,
        NotificationsModule,
    ],
})
export class AppModule { }
