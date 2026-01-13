import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PitchService } from './pitch.service';
import { AiService } from '../ai/ai.service';
import { MeetingsService } from '../meetings/meetings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import { ScheduleMeetingDto } from '../meetings/dto/meetings.dto';

@ApiTags('Pitch')
@Controller('pitch')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PitchController {
    constructor(
        private readonly pitchService: PitchService,
        private readonly aiService: AiService,
        private readonly meetingsService: MeetingsService,
    ) { }

    @Get(':id')
    @ApiOperation({ summary: 'Get full pitch details' })
    @ApiResponse({ status: 200, description: 'Pitch details retrieved successfully' })
    async getPitchDetails(@Param('id') reelId: string) {
        return this.pitchService.getPitchDetails(reelId);
    }

    @Post(':startupId/investor-ai')
    @UseGuards(RolesGuard)
    @Roles(UserRole.INVESTOR, UserRole.INCUBATOR, UserRole.ADMIN)
    @ApiOperation({ summary: 'Get AI analysis for startup (Investor/Incubator only)' })
    @ApiResponse({ status: 200, description: 'AI analysis retrieved successfully' })
    @ApiResponse({ status: 403, description: 'Forbidden - Investor/Incubator only' })
    async getInvestorAI(
        @Param('startupId') startupId: string,
        @CurrentUser() user: User,
    ) {
        return this.aiService.getInvestorAnalysis(startupId, user.id);
    }

    @Post(':startupId/schedule-meeting')
    @UseGuards(RolesGuard)
    @Roles(UserRole.INVESTOR, UserRole.INCUBATOR, UserRole.ADMIN)
    @ApiOperation({ summary: 'Schedule meeting with founder (Investor/Incubator only)' })
    @ApiResponse({ status: 201, description: 'Meeting request created successfully' })
    @ApiResponse({ status: 403, description: 'Forbidden - Investor/Incubator only' })
    async scheduleMeeting(
        @Param('startupId') startupId: string,
        @CurrentUser() user: User,
        @Body() dto: ScheduleMeetingDto,
    ) {
        return this.meetingsService.requestMeeting(user.id, startupId, dto);
    }
}
