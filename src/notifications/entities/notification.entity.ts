import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum NotificationType {
    BATTLEGROUND = 'battleground',
    INVESTOR = 'investor',
    PITCH = 'pitch',
    SYSTEM = 'system',
}

@Entity('notifications')
export class Notification {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'user_id' })
    @Index()
    userId: string;

    @ManyToOne(() => User, (user) => user.notifications, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({
        type: 'enum',
        enum: NotificationType,
    })
    @Index()
    type: NotificationType;

    @Column()
    title: string;

    @Column({ type: 'text' })
    message: string;

    @Column({ nullable: true })
    link: string;

    @Column({ name: 'is_read', default: false })
    @Index()
    isRead: boolean;

    @CreateDateColumn({ name: 'created_at' })
    @Index()
    createdAt: Date;
}
