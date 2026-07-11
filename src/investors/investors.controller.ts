import { Controller, Post, Body, Get, UseGuards, Patch } from '@nestjs/common';
import { InvestorsService } from './investors.service';
import { CreateInvestorDto } from './dto/create-investor.dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';

@Controller('investors')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class InvestorsController {
    constructor(private readonly investorsService: InvestorsService) { }

    @Post()
    @Roles(UserRole.INVESTOR)
    create(@CurrentUser() user: User, @Body() dto: CreateInvestorDto) {
        return this.investorsService.create(user.id, dto);
    }

    @Get('my')
    getMyProfile(@CurrentUser() user: User) {
        return this.investorsService.findMyInvestorProfile(user.id);
    }

    @Patch('my')
    @Roles(UserRole.INVESTOR)
    updateMyProfile(@CurrentUser() user: User, @Body() dto: Partial<CreateInvestorDto>) {
        return this.investorsService.updateMyProfile(user.id, dto);
    }
}
