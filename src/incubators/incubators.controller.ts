import { Controller, Post, Body, Get, UseGuards, Patch } from '@nestjs/common';
import { IncubatorsService } from './incubators.service';
import { CreateIncubatorDto } from './dto/create-incubator.dto';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';

@Controller('incubators')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class IncubatorsController {
    constructor(private readonly incubatorsService: IncubatorsService) { }

    @Post()
    @Roles(UserRole.INCUBATOR)
    create(@CurrentUser() user: User, @Body() dto: CreateIncubatorDto) {
        return this.incubatorsService.create(user.id, dto);
    }

    @Get('my')
    getMyProfile(@CurrentUser() user: User) {
        return this.incubatorsService.findMyIncubatorProfile(user.id);
    }

    @Patch('my')
    @Roles(UserRole.INCUBATOR)
    updateMyProfile(@CurrentUser() user: User, @Body() dto: Partial<CreateIncubatorDto>) {
        return this.incubatorsService.updateMyProfile(user.id, dto);
    }
}
