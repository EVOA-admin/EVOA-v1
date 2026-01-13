import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { MeetingsService } from './meetings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@ApiTags('Meetings')
@Controller('meetings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MeetingsController {
    constructor(private readonly meetingsService: MeetingsService) { }

    @Get()
    @ApiOperation({ summary: 'Get user meetings' })
    @ApiResponse({ status: 200, description: 'Meetings retrieved successfully' })
    async getUserMeetings(@CurrentUser() user: User) {
        return this.meetingsService.getUserMeetings(user.id);
    }

    @Post(':id/accept')
    @ApiOperation({ summary: 'Accept meeting request (Founder only)' })
    @ApiResponse({ status: 200, description: 'Meeting accepted successfully' })
    @ApiResponse({ status: 403, description: 'Only founder can accept' })
    async acceptMeeting(@Param('id') meetingId: string, @CurrentUser() user: User) {
        return this.meetingsService.acceptMeeting(meetingId, user.id);
    }

    @Post(':id/reject')
    @ApiOperation({ summary: 'Reject meeting request (Founder only)' })
    @ApiResponse({ status: 200, description: 'Meeting rejected successfully' })
    @ApiResponse({ status: 403, description: 'Only founder can reject' })
    async rejectMeeting(@Param('id') meetingId: string, @CurrentUser() user: User) {
        return this.meetingsService.rejectMeeting(meetingId, user.id);
    }
}
