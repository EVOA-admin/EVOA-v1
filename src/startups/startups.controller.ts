import { Controller, Get, Post, Delete, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { StartupsService } from './startups.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@ApiTags('Startups')
@Controller('startups')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StartupsController {
    constructor(private readonly startupsService: StartupsService) { }

    @Get(':id')
    @ApiOperation({ summary: 'Get startup details' })
    @ApiResponse({ status: 200, description: 'Startup retrieved successfully' })
    async getStartup(@Param('id') startupId: string) {
        return this.startupsService.getStartup(startupId);
    }

    @Post(':id/follow')
    @ApiOperation({ summary: 'Follow a startup' })
    @ApiResponse({ status: 201, description: 'Startup followed successfully' })
    @ApiResponse({ status: 409, description: 'Already following' })
    async followStartup(@Param('id') startupId: string, @CurrentUser() user: User) {
        return this.startupsService.followStartup(startupId, user.id);
    }

    @Delete(':id/follow')
    @ApiOperation({ summary: 'Unfollow a startup' })
    @ApiResponse({ status: 200, description: 'Startup unfollowed successfully' })
    async unfollowStartup(@Param('id') startupId: string, @CurrentUser() user: User) {
        return this.startupsService.unfollowStartup(startupId, user.id);
    }

    @Get('following/me')
    @ApiOperation({ summary: 'Get followed startups' })
    @ApiResponse({ status: 200, description: 'Followed startups retrieved' })
    async getFollowedStartups(@CurrentUser() user: User) {
        return this.startupsService.getUserFollowedStartups(user.id);
    }
}
