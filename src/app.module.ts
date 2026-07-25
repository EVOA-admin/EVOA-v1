import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { dataSourceOptions } from './config/database.config';
import { validate } from './config/env.validation';
import { RedisModule } from './config/redis.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ReelsModule } from './reels/reels.module';
import { PitchModule } from './pitch/pitch.module';
import { AiModule } from './ai/ai.module';
import { MeetingsModule } from './meetings/meetings.module';
import { StartupsModule } from './startups/startups.module';
import { ExploreModule } from './explore/explore.module';
import { NotificationsModule } from './notifications/notifications.module';
import { InvestorsModule } from './investors/investors.module';
import { IncubatorsModule } from './incubators/incubators.module';
import { PostsModule } from './posts/posts.module';
import { StoriesModule } from './stories/stories.module';
import { ChatModule } from './chat/chat.module';
import { AmbassadorModule } from './ambassador/ambassador.module';
import { PricingModule } from './pricing/pricing.module';
import { BattlegroundModule } from './battleground/battleground.module';
import { AdminModule } from './admin/admin.module';
import { EventsModule } from './events/events.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: '.env',
            validate,
        }),
        TypeOrmModule.forRoot({
            ...dataSourceOptions,
            autoLoadEntities: true,
        }),
        ThrottlerModule.forRoot([
            {
                ttl: parseInt(process.env.RATE_LIMIT_TTL || '60000', 10),
                limit: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
            },
        ]),
        RedisModule,
        AuthModule,
        UsersModule,
        ReelsModule,
        PitchModule,
        AiModule,
        MeetingsModule,
        StartupsModule,
        ExploreModule,
        NotificationsModule,
        InvestorsModule,
        IncubatorsModule,
        PostsModule,
        StoriesModule,
        ChatModule,
        AmbassadorModule,
        PricingModule,
        BattlegroundModule,
        AdminModule,
        EventsModule,
    ],
    providers: [
        {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
        },
    ],
})
export class AppModule { }
