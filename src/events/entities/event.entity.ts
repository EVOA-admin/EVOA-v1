import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn, OneToMany, Index,
} from 'typeorm';
import { EventTicket } from './event-ticket.entity';

export enum EventStatus {
    DRAFT = 'draft',
    PUBLISHED = 'published',
    ARCHIVED = 'archived',
    CANCELLED = 'cancelled',
}

export enum VenueType {
    OFFLINE = 'offline',
    ONLINE = 'online',
    HYBRID = 'hybrid',
}

export enum EventType {
    EVENT = 'event_only',
    EVENT_WITH_SUBSCRIPTION = 'event_with_subscription',
}

@Entity('events')
export class Event {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'event_type', type: 'varchar', default: EventType.EVENT_WITH_SUBSCRIPTION })
    eventType: EventType;

    @Column({ unique: true })
    @Index()
    slug: string;

    @Column()
    title: string;

    @Column({ nullable: true })
    subtitle: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ name: 'collaboration_name', nullable: true })
    collaborationName: string;

    @Column({ nullable: true })
    organizer: string;

    @Column({ name: 'poster_url', type: 'text', nullable: true })
    posterUrl: string;

    @Column({ name: 'banner_url', type: 'text', nullable: true })
    bannerUrl: string;

    @Column({ name: 'partner_logos', type: 'jsonb', default: '[]' })
    partnerLogos: string[];

    @Column({ name: 'gallery_images', type: 'jsonb', default: '[]' })
    galleryImages: string[];

    @Column({ type: 'varchar', default: EventStatus.DRAFT })
    status: EventStatus;

    @Column({ name: 'is_featured', default: false })
    isFeatured: boolean;

    @Column({ name: 'venue_type', type: 'varchar', default: VenueType.OFFLINE })
    venueType: VenueType;

    @Column({ name: 'venue_name', nullable: true })
    venueName: string;

    @Column({ type: 'text', nullable: true })
    address: string;

    @Column({ nullable: true })
    city: string;

    @Column({ nullable: true })
    state: string;

    @Column({ nullable: true })
    country: string;

    @Column({ name: 'google_maps_url', type: 'text', nullable: true })
    googleMapsUrl: string;

    @Column({ name: 'meeting_url', type: 'text', nullable: true })
    meetingUrl: string;

    @Column({ name: 'start_date', nullable: true })
    startDate: string;

    @Column({ name: 'end_date', nullable: true })
    endDate: string;

    @Column({ name: 'start_time', nullable: true })
    startTime: string;

    @Column({ name: 'end_time', nullable: true })
    endTime: string;

    @Column({ default: 'IST' })
    timezone: string;

    @Column({ type: 'jsonb', default: '[]' })
    benefits: Array<{ icon?: string; title: string; desc?: string }>;

    @Column({ type: 'jsonb', default: '[]' })
    highlights: Array<{ label: string; value: string }>;

    @Column({ name: 'bundle_items', type: 'jsonb', default: '[]' })
    bundleItems: Array<{ icon?: string; name: string; sub?: string; val?: string }>;

    @Column({ type: 'jsonb', default: '[]' })
    faqs: Array<{ q: string; a: string }>;

    @Column({ name: 'max_attendees', type: 'int', nullable: true })
    maxAttendees: number;

    @Column({ name: 'is_registration_open', default: true })
    isRegistrationOpen: boolean;

    @Column({ name: 'booking_start_date', type: 'timestamp', nullable: true })
    bookingStartDate: Date;

    @Column({ name: 'booking_end_date', type: 'timestamp', nullable: true })
    bookingEndDate: Date;

    @Column({ name: 'allow_bookings', default: true })
    allowBookings: boolean;

    @Column({ name: 'show_remaining_seats', default: true })
    showRemainingSeats: boolean;

    @Column({ name: 'meta_title', nullable: true })
    metaTitle: string;

    @Column({ name: 'meta_description', type: 'text', nullable: true })
    metaDescription: string;

    @Column({ name: 'og_image_url', type: 'text', nullable: true })
    ogImageUrl: string;

    @Column({ name: 'role_pricing', type: 'jsonb', nullable: true })
    rolePricing: Record<string, { price: number; originalPrice?: number; isActive?: boolean; badgeText?: string }>;

    @Column({ name: 'role_benefits', type: 'jsonb', nullable: true })
    roleBenefits: Record<string, Array<{ icon?: string; title: string; desc?: string }>>;

    @Column({ name: 'created_by_admin_id', nullable: true })
    createdByAdminId: string;

    @Column({ name: 'created_by_admin_name', nullable: true })
    createdByAdminName: string;

    @OneToMany(() => EventTicket, (ticket) => ticket.event, { cascade: true })
    tickets: EventTicket[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
