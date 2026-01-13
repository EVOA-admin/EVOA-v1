import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';

@Injectable()
export class NotificationsService {
    constructor(
        @InjectRepository(Notification)
        private readonly notificationRepository: Repository<Notification>,
    ) { }

    async getUserNotifications(userId: string, type?: NotificationType | string) {
        const where: any = { userId };

        if (type && type !== 'all') {
            where.type = type;
        }

        return this.notificationRepository.find({
            where,
            order: { createdAt: 'DESC' },
            take: 50,
        });
    }

    async markAsRead(notificationId: string, userId: string) {
        await this.notificationRepository.update(
            { id: notificationId, userId },
            { isRead: true },
        );

        return { message: 'Notification marked as read' };
    }

    async markAllAsRead(userId: string) {
        await this.notificationRepository.update(
            { userId, isRead: false },
            { isRead: true },
        );

        return { message: 'All notifications marked as read' };
    }

    async createNotification(
        userId: string,
        type: NotificationType,
        title: string,
        message: string,
        link?: string,
    ) {
        const notification = this.notificationRepository.create({
            userId,
            type,
            title,
            message,
            link,
        });

        return this.notificationRepository.save(notification);
    }
}
