import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { NotificationType } from './entities/notification.entity';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) { }

    @Get()
    @ApiOperation({ summary: 'Get user notifications' })
    @ApiQuery({ name: 'type', enum: ['all', 'battleground', 'investor', 'pitch', 'system'], required: false })
    @ApiResponse({ status: 200, description: 'Notifications retrieved' })
    async getNotifications(
        @CurrentUser() user: User,
        @Query('type') type?: NotificationType,
    ) {
        return this.notificationsService.getUserNotifications(user.id, type);
    }

    @Post(':id/read')
    @ApiOperation({ summary: 'Mark notification as read' })
    @ApiResponse({ status: 200, description: 'Notification marked as read' })
    async markAsRead(@Param('id') notificationId: string, @CurrentUser() user: User) {
        return this.notificationsService.markAsRead(notificationId, user.id);
    }

    @Post('read-all')
    @ApiOperation({ summary: 'Mark all notifications as read' })
    @ApiResponse({ status: 200, description: 'All notifications marked as read' })
    async markAllAsRead(@CurrentUser() user: User) {
        return this.notificationsService.markAllAsRead(user.id);
    }
}
