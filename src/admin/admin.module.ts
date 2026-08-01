import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthGuardModule } from '../auth/auth-guard.module';
import { BattlegroundRegistration } from '../battleground/entities/battleground-registration.entity';
import { Investor } from '../investors/entities/investor.entity';
import { PricingOrder } from '../pricing/entities/pricing-order.entity';
import { Reel } from '../reels/entities/reel.entity';
import { Startup } from '../startups/entities/startup.entity';
import { User } from '../users/entities/user.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminAuthController } from './admin-auth.controller';
import { AdminManagementController } from './admin-management.controller';
import { AdminAuthService } from './admin-auth.service';
import { Admin } from './entities/admin.entity';
import { BattlegroundAdminState } from './entities/battleground-admin-state.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            User,
            Startup,
            Investor,
            Reel,
            BattlegroundRegistration,
            PricingOrder,
            BattlegroundAdminState,
            Admin,
        ]),
        AuthGuardModule,
    ],
    controllers: [AdminController, AdminAuthController, AdminManagementController],
    providers: [AdminService, AdminAuthService],
    exports: [AdminAuthService],
})
export class AdminModule { }
