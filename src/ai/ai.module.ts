import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiService } from './ai.service';
import { InvestorAiLog } from './entities/investor-ai-log.entity';
import { Startup } from '../startups/entities/startup.entity';
import { redisClientFactory, RedisService } from '../config/redis.config';

@Module({
    imports: [TypeOrmModule.forFeature([InvestorAiLog, Startup])],
    providers: [AiService, redisClientFactory, RedisService],
    exports: [AiService],
})
export class AiModule { }
