import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReelsController } from './reels.controller';
import { ReelsService } from './reels.service';
import { Reel } from './entities/reel.entity';
import { ReelLike } from './entities/reel-like.entity';
import { ReelComment } from './entities/reel-comment.entity';
import { ReelShare } from './entities/reel-share.entity';
import { Follow } from '../startups/entities/follow.entity';
import { redisClientFactory, RedisService } from '../config/redis.config';

@Module({
    imports: [
        TypeOrmModule.forFeature([Reel, ReelLike, ReelComment, ReelShare, Follow]),
    ],
    controllers: [ReelsController],
    providers: [ReelsService, redisClientFactory, RedisService],
    exports: [ReelsService],
})
export class ReelsModule { }
