import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Event } from './event.entity';

@Entity('event_tickets')
export class EventTicket {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'event_id' })
    @Index()
    eventId: string;

    @ManyToOne(() => Event, (event) => event.tickets, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'event_id' })
    event: Event;

    @Column()
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    price: number;

    @Column({ name: 'original_price', type: 'decimal', precision: 10, scale: 2, nullable: true })
    originalPrice: number;

    @Column({ default: 'INR' })
    currency: string;

    @Column({ name: 'seat_count', type: 'int', nullable: true })
    seatCount: number;

    @Column({ name: 'remaining_seats', type: 'int', nullable: true })
    remainingSeats: number;

    @Column({ name: 'sale_start', type: 'timestamp', nullable: true })
    saleStart: Date;

    @Column({ name: 'sale_end', type: 'timestamp', nullable: true })
    saleEnd: Date;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @Column({ name: 'badge_text', nullable: true })
    badgeText: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
