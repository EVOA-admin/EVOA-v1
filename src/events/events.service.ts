import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event, EventStatus } from './entities/event.entity';
import { EventTicket } from './entities/event-ticket.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';

@Injectable()
export class EventsService {
    constructor(
        @InjectRepository(Event)
        private readonly eventRepo: Repository<Event>,
        @InjectRepository(EventTicket)
        private readonly ticketRepo: Repository<EventTicket>,
    ) {}

    // Helper: Slugify title
    private slugify(text: string): string {
        return text
            .toString()
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^\w\-]+/g, '')
            .replace(/\-\-+/g, '-');
    }

    // ── PUBLIC METHODS ────────────────────────────────────────────────────────

    async getFeaturedEvent(): Promise<Event> {
        // Find explicitly featured published event, fallback to latest published event
        let event = await this.eventRepo.findOne({
            where: { status: EventStatus.PUBLISHED, isFeatured: true },
            relations: ['tickets'],
            order: { createdAt: 'DESC' },
        });

        if (!event) {
            event = await this.eventRepo.findOne({
                where: { status: EventStatus.PUBLISHED },
                relations: ['tickets'],
                order: { createdAt: 'DESC' },
            });
        }

        if (!event) {
            throw new NotFoundException('No active published event found.');
        }

        return event;
    }

    async getAllPublishedEvents(): Promise<Event[]> {
        return this.eventRepo.find({
            where: { status: EventStatus.PUBLISHED },
            relations: ['tickets'],
            order: { createdAt: 'DESC' },
        });
    }

    async getEventBySlug(slug: string): Promise<Event> {
        const event = await this.eventRepo.findOne({
            where: { slug, status: EventStatus.PUBLISHED },
            relations: ['tickets'],
        });

        if (!event) {
            throw new NotFoundException(`Event with slug "${slug}" not found.`);
        }

        return event;
    }

    async getEventById(id: string): Promise<Event> {
        const event = await this.eventRepo.findOne({
            where: { id },
            relations: ['tickets'],
        });

        if (!event) {
            throw new NotFoundException(`Event with ID "${id}" not found.`);
        }

        return event;
    }

    async getEventTickets(eventId: string): Promise<EventTicket[]> {
        return this.ticketRepo.find({
            where: { eventId, isActive: true },
            order: { price: 'ASC' },
        });
    }

    // ── ADMIN METHODS ─────────────────────────────────────────────────────────

    async getAllEventsAdmin(): Promise<Event[]> {
        return this.eventRepo.find({
            relations: ['tickets'],
            order: { createdAt: 'DESC' },
        });
    }

    async createEvent(dto: CreateEventDto): Promise<Event> {
        let slug = dto.slug ? this.slugify(dto.slug) : this.slugify(dto.title);

        // Ensure unique slug
        const existing = await this.eventRepo.findOne({ where: { slug } });
        if (existing) {
            slug = `${slug}-${Date.now().toString().slice(-4)}`;
        }

        if (dto.isFeatured) {
            // Un-feature all other events
            await this.eventRepo.update({ isFeatured: true }, { isFeatured: false });
        }

        const event = this.eventRepo.create({
            ...dto,
            slug,
            partnerLogos: dto.partnerLogos || [],
            galleryImages: dto.galleryImages || [],
            benefits: dto.benefits || [],
            highlights: dto.highlights || [],
            bundleItems: dto.bundleItems || [],
            faqs: dto.faqs || [],
        });

        return this.eventRepo.save(event);
    }

    async updateEvent(id: string, dto: UpdateEventDto): Promise<Event> {
        const event = await this.getEventById(id);

        if (dto.slug && dto.slug !== event.slug) {
            const newSlug = this.slugify(dto.slug);
            const existing = await this.eventRepo.findOne({ where: { slug: newSlug } });
            if (existing && existing.id !== id) {
                throw new BadRequestException(`Slug "${newSlug}" is already in use.`);
            }
            dto.slug = newSlug;
        }

        if (dto.isFeatured && !event.isFeatured) {
            await this.eventRepo.update({ isFeatured: true }, { isFeatured: false });
        }

        Object.assign(event, dto);
        return this.eventRepo.save(event);
    }

    async deleteEvent(id: string): Promise<{ message: string }> {
        const event = await this.getEventById(id);
        await this.eventRepo.remove(event);
        return { message: 'Event deleted successfully.' };
    }

    async setEventStatus(id: string, status: EventStatus): Promise<Event> {
        const event = await this.getEventById(id);
        event.status = status;
        return this.eventRepo.save(event);
    }

    async setFeaturedEvent(id: string): Promise<Event> {
        const event = await this.getEventById(id);
        // Reset all others
        await this.eventRepo.update({ isFeatured: true }, { isFeatured: false });
        event.isFeatured = true;
        event.status = EventStatus.PUBLISHED; // Auto-publish if set as featured
        return this.eventRepo.save(event);
    }

    // ── TICKET MANAGEMENT ─────────────────────────────────────────────────────

    async addTicket(eventId: string, dto: CreateTicketDto): Promise<EventTicket> {
        await this.getEventById(eventId); // Verify event exists
        const ticket = this.ticketRepo.create({
            ...dto,
            eventId,
            remainingSeats: dto.remainingSeats ?? dto.seatCount,
        });
        return this.ticketRepo.save(ticket);
    }

    async updateTicket(ticketId: string, dto: UpdateTicketDto): Promise<EventTicket> {
        const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
        if (!ticket) {
            throw new NotFoundException(`Ticket with ID "${ticketId}" not found.`);
        }
        Object.assign(ticket, dto);
        return this.ticketRepo.save(ticket);
    }

    async deleteTicket(ticketId: string): Promise<{ message: string }> {
        const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
        if (!ticket) {
            throw new NotFoundException(`Ticket with ID "${ticketId}" not found.`);
        }
        await this.ticketRepo.remove(ticket);
        return { message: 'Ticket deleted successfully.' };
    }
}
