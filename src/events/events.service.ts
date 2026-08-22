import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
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
import { MailService } from '../mail/mail.service';
import { EventPassPdfService } from './event-pass-pdf.service';

@Injectable()
export class EventsService {
    private readonly logger = new Logger(EventsService.name);

    constructor(
        @InjectRepository(Event)
        private readonly eventRepo: Repository<Event>,
        @InjectRepository(EventTicket)
        private readonly ticketRepo: Repository<EventTicket>,
        @InjectRepository(UserEventTicket)
        private readonly userTicketRepo: Repository<UserEventTicket>,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        private readonly mailService: MailService,
        private readonly eventPassPdfService: EventPassPdfService,
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

        const coverImageUrl = dto.coverImageUrl || dto.cover_image_url || null;
        const bannerUrl = dto.bannerUrl || dto.banner_url || dto.posterUrl || dto.poster_url || null;

        const event = this.eventRepo.create({
            ...dto,
            coverImageUrl: coverImageUrl || undefined,
            bannerUrl: bannerUrl || undefined,
            posterUrl: bannerUrl || undefined,
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

        const coverImageUrl = dto.coverImageUrl || dto.cover_image_url;
        if (coverImageUrl !== undefined) {
            event.coverImageUrl = coverImageUrl;
        }

        const bannerUrl = dto.bannerUrl || dto.banner_url || dto.posterUrl || dto.poster_url;
        if (bannerUrl !== undefined) {
            event.bannerUrl = bannerUrl;
            event.posterUrl = bannerUrl;
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
        if (dto.userEmail && dto.userEmail !== user.email) whereConditions.push({ userEmail: dto.userEmail, eventId: event.id });
        if (dto.orderId) whereConditions.push({ orderId: dto.orderId });
        if (dto.paymentId) whereConditions.push({ paymentId: dto.paymentId });

        const existingTicket = await this.userTicketRepo.findOne({
            where: whereConditions,
            relations: ['event'],
            order: { createdAt: 'ASC' },
        });

        if (existingTicket) {
            // If email was never sent for this ticket (or failed previously), trigger dispatch now
            if (existingTicket.emailStatus !== 'SENT') {
                this.sendEventPassEmailForTicket(existingTicket, true).catch((err) => {
                    this.logger.warn(`[EventsService] Background Event Pass email dispatch failed for ${existingTicket.ticketCode}: ${err?.message || err}`);
                });
            }
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
        const userEmail = (dto.userEmail && dto.userEmail.trim()) ? dto.userEmail.trim() : (user?.email && user.email.trim()) ? user.email.trim() : '';
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

        // Trigger Event Pass PDF generation and Brevo transactional email delivery in background
        this.sendEventPassEmailForTicket(saved, true).catch((err) => {
            this.logger.warn(`[EventsService] Background Event Pass email dispatch failed for ${saved.ticketCode}: ${err?.message || err}`);
        });

        return saved;
    }

    /**
     * Idempotent Event Pass generator and email dispatcher.
     * Generates a vector PDF ticket and dispatches it via Brevo / multi-provider mail service.
     */
    async sendEventPassEmailForTicket(ticketOrId: string | UserEventTicket, forceResend = false): Promise<{ success: boolean; alreadySent?: boolean; error?: string }> {
        try {
            let ticket: UserEventTicket | null = null;
            const ticketId = typeof ticketOrId === 'string' ? ticketOrId : ticketOrId?.id;

            if (ticketId) {
                ticket = await this.userTicketRepo.findOne({
                    where: { id: ticketId },
                    relations: ['event', 'user'],
                });
            }
            if (!ticket && typeof ticketOrId === 'object') {
                ticket = ticketOrId;
            }

            if (!ticket) {
                this.logger.warn(`[EventsService] Cannot send event pass: Ticket not found.`);
                return { success: false, error: 'Ticket not found' };
            }

            // Idempotency: Prevent duplicate emails if already sent unless explicitly requested
            if (!forceResend && ticket.emailStatus === 'SENT') {
                this.logger.log(`[EventsService] Event Pass email already sent for ticket ${ticket.ticketCode} at ${ticket.emailSentAt}. Skipping duplicate.`);
                return { success: true, alreadySent: true };
            }

            // Load user & event if not already populated
            if (!ticket.user && ticket.userId) {
                const fetchedUser = await this.userRepo.findOne({ where: { id: ticket.userId } }) ||
                                   await this.userRepo.findOne({ where: { supabaseUserId: ticket.userId } });
                if (fetchedUser) ticket.user = fetchedUser;
            }
            if (!ticket.event && ticket.eventId) {
                const fetchedEvent = await this.eventRepo.findOne({ where: { id: ticket.eventId } });
                if (fetchedEvent) ticket.event = fetchedEvent;
            }

            const user = ticket.user as any;
            const event = ticket.event;

            if (!event) {
                this.logger.warn(`[EventsService] Cannot send event pass for ${ticket.ticketCode}: Event details missing.`);
                return { success: false, error: 'Event details missing' };
            }

            // Resolve attendee name
            const rawName = ticket.userName || user?.fullName || user?.name || user?.founderName || user?.companyName || user?.username;
            const isEmail = (str: string) => typeof str === 'string' && str.includes('@');
            let attendeeName = rawName && !isEmail(rawName) ? rawName.trim() : '';
            const attendeeEmail = (ticket.userEmail && ticket.userEmail.trim()) || (user?.email && user.email.trim()) || '';

            if (!attendeeName && attendeeEmail && isEmail(attendeeEmail)) {
                const handle = attendeeEmail.split('@')[0].replace(/[._-]/g, ' ');
                attendeeName = handle.replace(/\b\w/g, (c) => c.toUpperCase());
            }
            if (!attendeeName) {
                attendeeName = 'Attendee';
            }

            if (!attendeeEmail) {
                this.logger.warn(`[EventsService] Cannot send event pass for ${ticket.ticketCode}: No valid attendee email found.`);
                await this.userTicketRepo.update({ id: ticket.id }, { emailStatus: 'FAILED' });
                return { success: false, error: 'No attendee email found' };
            }

            // Format event date & time
            const eventTitle = event.collaborationName || event.title || 'EVOA Exclusive Event';
            let formattedDate = 'Date Announced Soon';
            if (event.startDate) {
                try {
                    formattedDate = new Date(event.startDate).toLocaleDateString('en-IN', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                    });
                } catch (_) {
                    formattedDate = String(event.startDate);
                }
            }

            const formattedTime = event.startTime ? `${event.startTime} ${event.timezone || 'IST'}` : 'Time TBA';
            const eventVenue = event.venueName || event.address || event.meetingUrl || 'Venue Announced Soon';
            const eventCity = event.city || event.state || '';
            const userRole = (ticket.userRole || user?.role || 'ATTENDEE').toUpperCase();

            // 1. Generate high-quality vector PDF Event Pass
            const pdfBuffer = await this.eventPassPdfService.generatePassPdf({
                ticketCode: ticket.ticketCode,
                userName: attendeeName,
                userEmail: attendeeEmail,
                userRole,
                eventTitle,
                eventDate: formattedDate,
                eventTime: formattedTime,
                eventVenue,
                eventCity,
                orderId: ticket.orderId || undefined,
                paymentId: ticket.paymentId || undefined,
                price: Number(ticket.price || 0),
                qrCodeData: ticket.qrCodeData || undefined,
            });

            // 2. Dispatch email with PDF attachment via Brevo
            await this.mailService.sendEventPassEmail({
                to: attendeeEmail,
                attendeeName,
                eventTitle,
                ticketCode: ticket.ticketCode,
                eventDate: formattedDate,
                eventTime: formattedTime,
                eventVenue,
                userRole,
                orderId: ticket.orderId || undefined,
                paymentId: ticket.paymentId || undefined,
                price: Number(ticket.price || 0),
                pdfBuffer,
            });

            // 3. Mark email as SENT with timestamp
            await this.userTicketRepo.update(
                { id: ticket.id },
                {
                    emailStatus: 'SENT',
                    emailSentAt: new Date(),
                },
            );

            this.logger.log(`[EventsService] Event Pass email successfully sent and recorded for ticket ${ticket.ticketCode} to ${attendeeEmail}`);
            return { success: true };
        } catch (err: any) {
            this.logger.error(`[EventsService] Failed to generate/send event pass email for ticket: ${err?.message || err}`);
            try {
                const ticketId = typeof ticketOrId === 'string' ? ticketOrId : ticketOrId?.id;
                if (ticketId) {
                    await this.userTicketRepo.update({ id: ticketId }, { emailStatus: 'FAILED' });
                }
            } catch (_) { /* ignore DB update error */ }
            return { success: false, error: err?.message || 'Email delivery failed' };
        }
    }

    /**
     * Resend Event Pass email for a ticket (accessible by ticket owner or admin).
     */
    async resendTicketPass(user: User, ticketId: string) {
        const ticket = await this.userTicketRepo.findOne({
            where: { id: ticketId },
            relations: ['event', 'user'],
        });

        if (!ticket) {
            throw new NotFoundException(`Ticket not found.`);
        }

        // Authorization check: User must own the ticket or be admin
        const isAdmin = user.role === 'admin' || (user as any).adminRole;
        if (!isAdmin && ticket.userId !== user.id && ticket.userEmail !== user.email) {
            throw new ForbiddenException('You do not have permission to resend this ticket pass.');
        }

        const result = await this.sendEventPassEmailForTicket(ticket, true);
        if (!result.success) {
            throw new BadRequestException(result.error || 'Failed to dispatch Event Pass email. Please try again.');
        }

        return {
            success: true,
            message: 'Event Pass email dispatched successfully.',
            ticketCode: ticket.ticketCode,
        };
    }

    async getUserTicketForEvent(user: User, eventId: string): Promise<UserEventTicket | null> {
        const whereConditions: any[] = [
            { userId: user.id, eventId },
        ];
        if (user?.supabaseUserId && user.supabaseUserId !== user.id) {
            whereConditions.push({ userId: user.supabaseUserId, eventId });
        }
        if (user?.email) {
            whereConditions.push({ userEmail: user.email, eventId });
        }

        return this.userTicketRepo.findOne({
            where: whereConditions,
            relations: ['event'],
            order: { createdAt: 'ASC' },
        });
    }

    async getMyTickets(user: User): Promise<UserEventTicket[]> {
        const whereConditions: any[] = [
            { userId: user.id },
        ];
        if (user?.supabaseUserId && user.supabaseUserId !== user.id) {
            whereConditions.push({ userId: user.supabaseUserId });
        }
        if (user?.email) {
            whereConditions.push({ userEmail: user.email });
        }

        const tickets = await this.userTicketRepo.find({
            where: whereConditions,
            relations: ['event'],
            order: { createdAt: 'ASC' },
        });

        // Deduplicate tickets by eventId so each user has strictly ONE canonical ticket per event (earliest created)
        const eventTicketMap = new Map<string, UserEventTicket>();
        for (const t of tickets) {
            const eId = t.eventId || t.event?.id;
            const key = eId ? `event_${eId}` : (t.ticketCode || t.id);
            if (key && !eventTicketMap.has(key)) {
                eventTicketMap.set(key, t);
            }
        }
        return Array.from(eventTicketMap.values());
    }

    async getTicketByCode(ticketCode: string): Promise<UserEventTicket> {
        const ticket = await this.userTicketRepo.findOne({
            where: { ticketCode },
            relations: ['event', 'user'],
        });
        if (!ticket) {
            throw new NotFoundException(`Ticket code "${ticketCode}" not found.`);
        }
        return ticket;
    }

    async getAllEventCustomers(): Promise<any[]> {
        const userTickets = await this.userTicketRepo.find({
            relations: ['event', 'user'],
            order: { createdAt: 'DESC' },
        });

        return userTickets.map((ut) => {
            const u = (ut.user as any) || {};
            const rawName = ut.userName || u.fullName || u.name || u.companyName || u.founderName;
            const isEmail = (str: string) => typeof str === 'string' && str.includes('@');
            let fullName = rawName && !isEmail(rawName) ? rawName.trim() : '';

            const email = ut.userEmail || ut.user?.email || '';

            if (!fullName && email && isEmail(email)) {
                const handle = email.split('@')[0].replace(/[._-]/g, ' ');
                fullName = handle.replace(/\b\w/g, (c) => c.toUpperCase());
            }

            if (!fullName) {
                fullName = 'Attendee';
            }

            const eventName = ut.event?.title || 'Unknown Event';
            const userRole = (ut.userRole || ut.user?.role || 'ATTENDEE').toUpperCase();
            const purchaseDate = ut.createdAt;
            const price = Number(ut.price || 0);
            const paymentStatus = price > 0 ? 'COMPLETED (PAID)' : 'COMPLETED (FREE PASS)';

            return {
                id: ut.id,
                ticketCode: ut.ticketCode,
                fullName,
                email: email || 'N/A',
                eventName,
                eventId: ut.eventId,
                userRole,
                purchaseDate,
                price,
                paymentStatus,
                orderId: ut.orderId || null,
                paymentId: ut.paymentId || null,
                emailStatus: ut.emailStatus || 'PENDING',
                emailSentAt: ut.emailSentAt || null,
            };
        });
    }
}
