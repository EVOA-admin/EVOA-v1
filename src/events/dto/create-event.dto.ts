import {
    IsString, IsOptional, IsEnum, IsBoolean, IsArray, IsInt, Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { EventStatus, VenueType, EventType } from '../entities/event.entity';

export class CreateEventDto {
    @ApiProperty({ enum: EventType, required: false })
    @IsOptional()
    @Transform(({ value }) => {
        if (value === 'event' || value === 'event_only') return EventType.EVENT;
        if (value === 'event_with_subscription') return EventType.EVENT_WITH_SUBSCRIPTION;
        return value;
    })
    @IsEnum(EventType)
    eventType?: EventType;
    @ApiProperty()
    @IsString()
    title: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    slug?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    subtitle?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    collaborationName?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    organizer?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    posterUrl?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    bannerUrl?: string;

    @ApiProperty({ type: [String], required: false })
    @IsOptional()
    @IsArray()
    partnerLogos?: string[];

    @ApiProperty({ type: [String], required: false })
    @IsOptional()
    @IsArray()
    galleryImages?: string[];

    @ApiProperty({ enum: EventStatus, required: false })
    @IsOptional()
    @IsEnum(EventStatus)
    status?: EventStatus;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsBoolean()
    isFeatured?: boolean;

    @ApiProperty({ enum: VenueType, required: false })
    @IsOptional()
    @IsEnum(VenueType)
    venueType?: VenueType;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    venueName?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    address?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    city?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    state?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    country?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    googleMapsUrl?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    meetingUrl?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    startDate?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    endDate?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    startTime?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    endTime?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    timezone?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsArray()
    benefits?: Array<{ icon?: string; title: string; desc?: string }>;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsArray()
    highlights?: Array<{ label: string; value: string }>;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsArray()
    bundleItems?: Array<{ icon?: string; name: string; sub?: string; val?: string }>;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsArray()
    faqs?: Array<{ q: string; a: string }>;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsInt()
    @Min(0)
    maxAttendees?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsBoolean()
    isRegistrationOpen?: boolean;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsBoolean()
    allowBookings?: boolean;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsBoolean()
    showRemainingSeats?: boolean;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    metaTitle?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    metaDescription?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    ogImageUrl?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsArray()
    tickets?: any[];

    @ApiProperty({ required: false })
    @IsOptional()
    rolePricing?: Record<string, { price: number; originalPrice?: number; isActive?: boolean; badgeText?: string }>;

    @ApiProperty({ required: false })
    @IsOptional()
    roleBenefits?: Record<string, Array<{ icon?: string; title: string; desc?: string }>>;
}
