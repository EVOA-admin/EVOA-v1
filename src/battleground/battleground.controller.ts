import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { BattlegroundService } from './battleground.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import { VerifyBattlegroundPaymentDto } from './dto/verify-battleground-payment.dto';
import { MarkBattlegroundPaymentFailedDto } from './dto/mark-battleground-payment-failed.dto';

@ApiTags('Battleground')
@Controller('battleground')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@ApiBearerAuth()
export class BattlegroundController {
    constructor(private readonly battlegroundService: BattlegroundService) { }

    @Get('overview')
    @ApiOperation({ summary: 'Get battleground overview and registered startups' })
    getOverview(@CurrentUser() user: User) {
        return this.battlegroundService.getOverview(user);
    }

    @Post('create-order')
    @Roles(UserRole.STARTUP)
    @ApiOperation({ summary: 'Create battleground participation payment order' })
    createOrder(@CurrentUser() user: User) {
        return this.battlegroundService.createOrder(user);
    }

    @Post('verify-payment')
    @ApiOperation({ summary: 'Verify battleground payment' })
    verifyPayment(@CurrentUser() user: User, @Body() dto: VerifyBattlegroundPaymentDto) {
        return this.battlegroundService.verifyPayment(user, dto);
    }

    @Post('mark-failed')
    @ApiOperation({ summary: 'Mark battleground payment attempt as failed' })
    markFailed(@CurrentUser() user: User, @Body() dto: MarkBattlegroundPaymentFailedDto) {
        return this.battlegroundService.markPaymentFailed(user, dto);
    }

    @Post('select-pitch/:reelId')
    @Roles(UserRole.STARTUP)
    @ApiOperation({ summary: 'Select a startup pitch for Battleground participation' })
    selectPitch(@CurrentUser() user: User, @Param('reelId') reelId: string) {
        return this.battlegroundService.selectPitch(user, reelId);
    }
}
