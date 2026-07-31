import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Event } from './event.entity';
import { User } from '../../users/entities/user.entity';

@Entity('user_event_tickets')
export class UserEventTicket {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'ticket_code', unique: true })
    @Index()
    ticketCode: string;

    @Column({ name: 'user_id' })
    @Index()
    userId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ name: 'event_id' })
    @Index()
    eventId: string;

    @ManyToOne(() => Event, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'event_id' })
    event: Event;

    @Column({ name: 'user_role', nullable: true })
    userRole: string;

    @Column({ name: 'user_name', nullable: true })
    userName: string;

    @Column({ name: 'user_email', nullable: true })
    userEmail: string;

    @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
    price: number;

    @Column({ name: 'order_id', nullable: true })
    orderId: string;

    @Column({ name: 'payment_id', nullable: true })
    paymentId: string;

    @Column({ name: 'qr_code_data', type: 'text' })
    qrCodeData: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
