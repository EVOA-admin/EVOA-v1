import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event, EventStatus } from './entities/event.entity';
import { EventTicket } from './entities/event-ticket.entity';
import { UserEventTicket } from './entities/user-event-ticket.entity';
import { User } from '../users/entities/user.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { BookTicketDto } from './dto/book-ticket.dto';
import { randomBytes } from 'crypto';
import { AdminRole } from '../admin/entities/admin.entity';

@Injectable()
export class EventsService {
    constructor(
        @InjectRepository(Event)
        private readonly eventRepo: Repository<Event>,
        @InjectRepository(EventTicket)
        private readonly ticketRepo: Repository<EventTicket>,
        @InjectRepository(UserEventTicket)
        private readonly userTicketRepo: Repository<UserEventTicket>,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
    ) {}

    private checkEventAuthorization(admin: any, event: Event) {
        const role = admin?.adminRole || admin?.role;
        const adminId = admin?.id || admin?.sub;

        if (role === AdminRole.EVENT_ADMIN || role === 'EVENT_ADMIN') {
            if (event.createdByAdminId && event.createdByAdminId !== adminId) {
                throw new ForbiddenException('Forbidden: Event Admins can only edit or delete events created by themselves.');
            }
        }
    }

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

    async getAllEventsAdmin(admin?: any): Promise<Event[]> {
        const role = admin?.adminRole || admin?.role;
        const adminId = admin?.id || admin?.sub;

        if (role === AdminRole.EVENT_ADMIN || role === 'EVENT_ADMIN') {
            return this.eventRepo.find({
                where: { createdByAdminId: adminId },
                relations: ['tickets'],
                order: { createdAt: 'DESC' },
            });
        }

        return this.eventRepo.find({
            relations: ['tickets'],
            order: { createdAt: 'DESC' },
        });
    }

    async createEvent(admin: any, dto: CreateEventDto): Promise<Event> {
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

        const adminId = admin?.id || admin?.sub || null;
        const adminName = admin?.fullName || admin?.name || 'EVOA Admin';

        const event = this.eventRepo.create({
            ...dto,
            slug,
            createdByAdminId: adminId,
            createdByAdminName: adminName,
            partnerLogos: dto.partnerLogos || [],
            galleryImages: dto.galleryImages || [],
            benefits: dto.benefits || [],
            highlights: dto.highlights || [],
            bundleItems: dto.bundleItems || [],
            faqs: dto.faqs || [],
        });

        return this.eventRepo.save(event);
    }

    async updateEvent(admin: any, id: string, dto: UpdateEventDto): Promise<Event> {
        const event = await this.getEventById(id);
        this.checkEventAuthorization(admin, event);

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

    async deleteEvent(admin: any, id: string): Promise<{ message: string }> {
        const event = await this.getEventById(id);
        this.checkEventAuthorization(admin, event);
        await this.eventRepo.remove(event);
        return { message: 'Event deleted successfully.' };
    }

    async setEventStatus(admin: any, id: string, status: EventStatus): Promise<Event> {
        const event = await this.getEventById(id);
        this.checkEventAuthorization(admin, event);
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

    // ── DIGITAL TICKET SYSTEM ──────────────────────────────────────────────────

    async bookTicket(user: User, dto: BookTicketDto): Promise<UserEventTicket> {
        const event = await this.getEventById(dto.eventId);

        // Check if user already purchased a ticket for this event
        const whereConditions: any[] = [
            { userId: user.id, eventId: event.id },
        ];
        if (user.supabaseUserId) whereConditions.push({ userId: user.supabaseUserId, eventId: event.id });
        if (user.email) whereConditions.push({ userEmail: user.email, eventId: event.id });

        const existingTicket = await this.userTicketRepo.findOne({
            where: whereConditions,
            relations: ['event'],
        });

        if (existingTicket) {
            return existingTicket;
        }

        // Generate unique ticket code: TKT-EVOA-XXXXXX
        let ticketCode = '';
        let exists = true;
        while (exists) {
            const randomCode = randomBytes(3).toString('hex').toUpperCase();
            ticketCode = `TKT-EVOA-${randomCode}`;
            const found = await this.userTicketRepo.findOne({ where: { ticketCode } });
            if (!found) exists = false;
        }

        const resolvedName = (
            (dto.userName && dto.userName.trim() && dto.userName.trim() !== 'Evoa Attendee')
                ? dto.userName.trim()
                : (user?.fullName && user.fullName.trim() && user.fullName.trim() !== 'Evoa Attendee')
                    ? user.fullName.trim()
                    : ((user as any)?.name && (user as any).name.trim())
                        ? (user as any).name.trim()
                        : ((user as any)?.username && (user as any).username.trim())
                            ? (user as any).username.trim()
                            : ((user as any)?.startupUsername && (user as any).startupUsername.trim())
                                ? (user as any).startupUsername.trim()
                                : (user?.email && user.email.trim())
                                    ? user.email.trim()
                                    : (dto.userEmail && dto.userEmail.trim())
                                        ? dto.userEmail.trim()
                                        : 'Evoa Attendee'
        );

        const userName = resolvedName;
        const userEmail = dto.userEmail || user?.email || '';
        const userRole = dto.userRole || user?.role || 'user';

        // Secure QR payload encoding unique identifiers
        const qrPayload = {
            ticketId: ticketCode,
            userId: user.id,
            eventId: event.id,
            purchaseId: dto.orderId || dto.paymentId || ticketCode,
            timestamp: Date.now(),
        };

        const userTicket = new UserEventTicket();
        userTicket.ticketCode = ticketCode;
        userTicket.userId = user.id;
        userTicket.eventId = event.id;
        userTicket.userRole = userRole;
        userTicket.userName = userName;
        userTicket.userEmail = userEmail;
        userTicket.price = dto.price ?? 0;
        userTicket.orderId = dto.orderId || '';
        userTicket.paymentId = dto.paymentId || '';
        userTicket.qrCodeData = JSON.stringify(qrPayload);

        const saved = await this.userTicketRepo.save(userTicket);
        saved.event = event;
        return saved;
    }

    async getUserTicketForEvent(user: User, eventId: string): Promise<UserEventTicket | null> {
        const whereConditions: any[] = [
            { userId: user.id, eventId },
        ];
        if (user?.supabaseUserId) whereConditions.push({ userId: user.supabaseUserId, eventId });
        if (user?.email) whereConditions.push({ userEmail: user.email, eventId });

        return this.userTicketRepo.findOne({
            where: whereConditions,
            relations: ['event'],
        });
    }

    async getMyTickets(user: User): Promise<UserEventTicket[]> {
        const whereConditions: any[] = [
            { userId: user.id },
        ];
        if (user?.supabaseUserId) whereConditions.push({ userId: user.supabaseUserId });
        if (user?.email) whereConditions.push({ userEmail: user.email });

        return this.userTicketRepo.find({
            where: whereConditions,
            relations: ['event'],
            order: { createdAt: 'DESC' },
        });
    }

    async getTicketByCode(ticketCode: string): Promise<UserEventTicket> {
        const ticket = await this.userTicketRepo.findOne({
            where: { ticketCode },
            relations: ['event'],
        });

        if (!ticket) {
            throw new NotFoundException(`Ticket "${ticketCode}" not found.`);
        }

        return ticket;
    }
}
