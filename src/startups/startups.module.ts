import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StartupsController } from './startups.controller';
import { StartupsService } from './startups.service';
import { Startup } from './entities/startup.entity';
import { Follow } from './entities/follow.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Startup, Follow])],
    controllers: [StartupsController],
    providers: [StartupsService],
    exports: [StartupsService],
})
export class StartupsModule { }
