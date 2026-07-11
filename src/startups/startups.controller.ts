import { Controller, Get, Post, Patch, Delete, Param, UseGuards, Body, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { StartupsService } from './startups.service';
import { AiService } from '../ai/ai.service';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateStartupDto } from './dto/create-startup.dto';

@ApiTags('Startups')
@Controller('startups')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@ApiBearerAuth()
export class StartupsController {
    constructor(
        private readonly startupsService: StartupsService,
        private readonly aiService: AiService
    ) { }

    @Post()
    @Roles(UserRole.STARTUP)
    @ApiOperation({ summary: 'Create a startup profile' })
    @ApiResponse({ status: 201, description: 'Startup created successfully' })
    @ApiResponse({ status: 409, description: 'Username already taken' })
    async createStartup(@CurrentUser() user: User, @Body() dto: CreateStartupDto) {
        return this.startupsService.createStartup(user.id, dto);
    }

    @Get('my')
    @ApiOperation({ summary: 'Get current founder\'s startup' })
    @ApiResponse({ status: 200, description: 'My startup retrieved' })
    async getMyStartup(@CurrentUser() user: User) {
        return this.startupsService.getMyStartup(user.id);
    }

    @Post('my/publish-reel')
    @Roles(UserRole.STARTUP)
    @ApiOperation({ summary: 'Publish or re-publish pitch video as a Reel' })
    @ApiResponse({ status: 201, description: 'Pitch reel published/updated' })
    async publishPitchReel(@CurrentUser() user: User) {
        return this.startupsService.publishPitchReel(user.id);
    }

    @Get('ranked')
    @ApiOperation({ summary: 'Get all startups ranked for listing' })
    @ApiResponse({ status: 200, description: 'Ranked startups retrieved successfully' })
    async getRankedStartups() {
        return this.startupsService.getRankedStartups();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get startup details' })
    @ApiResponse({ status: 200, description: 'Startup retrieved successfully' })
    async getStartup(@Param('id') startupId: string, @CurrentUser() user: User) {
        return this.startupsService.getStartup(startupId, user.id);
    }

    @Post(':id/profile-visit')
    @ApiOperation({ summary: 'Record a startup profile visit with lightweight duplicate protection' })
    async recordProfileVisit(@Param('id') startupId: string, @CurrentUser() user: User) {
        return this.startupsService.recordProfileVisit(startupId, user.id);
    }

    @Post(':id/analyze')
    @Roles(UserRole.INVESTOR, UserRole.INCUBATOR)
    @ApiOperation({ summary: 'Ask AI Analyst a question about the startup' })
    async analyzeStartup(
        @Param('id') startupId: string,
        @CurrentUser() user: User,
        @Body() body: { question: string }
    ) {
        return this.aiService.analyzeStartup(startupId, user.id, body.question);
    }

    @Get(':id/follow-status')
    @ApiOperation({ summary: 'Check if current user supports a startup' })
    async getFollowStatus(@Param('id') startupId: string, @CurrentUser() user: User) {
        return this.startupsService.getFollowStatus(startupId, user.id);
    }

    @Get(':id/supporters')
    @ApiOperation({ summary: 'Get list of users who support this startup' })
    @ApiResponse({ status: 200, description: 'Supporters list returned' })
    async getSupporters(@Param('id') startupId: string) {
        return this.startupsService.getSupporters(startupId);
    }

    @Patch(':id')
    @Roles(UserRole.STARTUP)
    @ApiOperation({ summary: 'Update startup (founder only)' })
    @ApiResponse({ status: 200, description: 'Startup updated successfully' })
    async updateStartup(@Param('id') startupId: string, @CurrentUser() user: User, @Body() dto: any) {
        return this.startupsService.updateStartup(user.id, startupId, dto);
    }

    @Post(':id/follow')
    @ApiOperation({ summary: 'Support a startup' })
    @ApiResponse({ status: 201, description: 'Startup supported successfully' })
    @ApiResponse({ status: 409, description: 'Already supporting' })
    async followStartup(@Param('id') startupId: string, @CurrentUser() user: User) {
        return this.startupsService.followStartup(startupId, user.id);
    }

    @Delete(':id/follow')
    @ApiOperation({ summary: 'Remove support from a startup' })
    @ApiResponse({ status: 200, description: 'Support removed successfully' })
    async unfollowStartup(@Param('id') startupId: string, @CurrentUser() user: User) {
        return this.startupsService.unfollowStartup(startupId, user.id);
    }

    @Get('following/me')
    @ApiOperation({ summary: 'Get startups the current user supports' })
    @ApiResponse({ status: 200, description: 'Followed startups retrieved' })
    async getFollowedStartups(@CurrentUser() user: User) {
        return this.startupsService.getUserFollowedStartups(user.id);
    }
}
