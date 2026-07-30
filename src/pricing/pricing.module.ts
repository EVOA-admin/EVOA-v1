import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';
import { PricingOrder } from './entities/pricing-order.entity';
import { User } from '../users/entities/user.entity';
import { Event } from '../events/entities/event.entity';
import { AuthGuardModule } from '../auth/auth-guard.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([PricingOrder, User, Event]),
        AuthGuardModule,
    ],
    controllers: [PricingController],
    providers: [PricingService],
})
export class PricingModule { }
