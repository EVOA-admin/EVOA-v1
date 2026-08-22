import {
    Controller, Get, Post, Put, Patch, Delete, Param, Body, UseGuards, Query, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { EventStatus } from './entities/event.entity';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import { BookTicketDto } from './dto/book-ticket.dto';

@ApiTags('Events')
@Controller('events')
export class EventsController {
    constructor(private readonly eventsService: EventsService) {}

    // ── DIGITAL TICKET ENDPOINTS ──────────────────────────────────────────────

    @Post('book-ticket')
    @UseGuards(SupabaseAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Book/Issue a digital event ticket for the current user' })
    async bookTicket(@CurrentUser() user: User, @Body() dto: BookTicketDto) {
        return this.eventsService.bookTicket(user, dto);
    }

    @Post('resend-pass/:ticketId')
    @UseGuards(SupabaseAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Resend official Event Pass email with PDF attachment' })
    async resendPass(@CurrentUser() user: User, @Param('ticketId') ticketId: string) {
        return this.eventsService.resendTicketPass(user, ticketId);
    }

    @Get('my-tickets')
    @UseGuards(SupabaseAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all purchased event tickets for the current user' })
    async getMyTickets(@CurrentUser() user: User) {
        return this.eventsService.getMyTickets(user);
    }

    @Get('user-ticket/:eventId')
    @UseGuards(SupabaseAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Check if current user has booked a ticket for a specific event' })
    async getUserTicketForEvent(@CurrentUser() user: User, @Param('eventId') eventId: string) {
        return this.eventsService.getUserTicketForEvent(user, eventId);
    }

    @Get('ticket-code/:code')
    @ApiOperation({ summary: 'Get ticket details by ticket code' })
    async getTicketByCode(@Param('code') code: string) {
        return this.eventsService.getTicketByCode(code);
    }

    // ── 1. STATIC PUBLIC ENDPOINTS ────────────────────────────────────────────

    @Get('featured')
    @ApiOperation({ summary: 'Get current featured published event with tickets' })
    async getFeaturedEvent() {
        return this.eventsService.getFeaturedEvent();
    }

    @Get()
    @ApiOperation({ summary: 'Get all published events' })
    async getAllPublishedEvents() {
        return this.eventsService.getAllPublishedEvents();
    }

    @Get('slug/:slug')
    @ApiOperation({ summary: 'Get published event by slug' })
    async getEventBySlug(@Param('slug') slug: string) {
        return this.eventsService.getEventBySlug(slug);
    }

    @Get('id/:id')
    @ApiOperation({ summary: 'Get event details by ID' })
    async getEventById(@Param('id') id: string) {
        return this.eventsService.getEventById(id);
    }

    // ── 2. STATIC ADMIN ENDPOINTS ─────────────────────────────────────────────

    @Get('admin/customers')
    @UseGuards(SupabaseAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all event customer ticket purchases (Super Admin / Admin only)' })
    async getAllEventCustomers() {
        return this.eventsService.getAllEventCustomers();
    }

    @Get('admin/all')
    @UseGuards(SupabaseAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all events (admin only: includes drafts, archived)' })
    async getAllEventsAdmin(@Req() req: any) {
        return this.eventsService.getAllEventsAdmin(req.admin || req.user);
    }

    @Post('admin/create')
    @UseGuards(SupabaseAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create new event (admin only)' })
    async createEvent(@Req() req: any, @Body() dto: CreateEventDto) {
        return this.eventsService.createEvent(req.admin || req.user, dto);
    }

    @Put('admin/tickets/:ticketId')
    @UseGuards(SupabaseAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update ticket tier (admin only)' })
    async updateTicket(@Param('ticketId') ticketId: string, @Body() dto: UpdateTicketDto) {
        return this.eventsService.updateTicket(ticketId, dto);
    }

    @Delete('admin/tickets/:ticketId')
    @UseGuards(SupabaseAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Delete ticket tier (admin only)' })
    async deleteTicket(@Param('ticketId') ticketId: string) {
        return this.eventsService.deleteTicket(ticketId);
    }

    // ── 3. PARAMETERIZED ADMIN ENDPOINTS ──────────────────────────────────────

    @Patch('admin/:id/status')
    @UseGuards(SupabaseAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update event status (draft, published, archived, cancelled)' })
    async setEventStatus(@Req() req: any, @Param('id') id: string, @Body('status') status: EventStatus) {
        return this.eventsService.setEventStatus(req.admin || req.user, id, status);
    }

    @Patch('admin/:id/featured')
    @UseGuards(SupabaseAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Set event as featured event' })
    async setFeaturedEvent(@Param('id') id: string) {
        return this.eventsService.setFeaturedEvent(id);
    }

    @Post('admin/:id/tickets')
    @UseGuards(SupabaseAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Add ticket tier to an event (admin only)' })
    async addTicket(@Param('id') id: string, @Body() dto: CreateTicketDto) {
        return this.eventsService.addTicket(id, dto);
    }

    @Put('admin/:id')
    @UseGuards(SupabaseAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update event details (admin only)' })
    async updateEvent(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateEventDto) {
        return this.eventsService.updateEvent(req.admin || req.user, id, dto);
    }

    @Delete('admin/:id')
    @UseGuards(SupabaseAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Delete event (admin only)' })
    async deleteEvent(@Req() req: any, @Param('id') id: string) {
        return this.eventsService.deleteEvent(req.admin || req.user, id);
    }

    // ── 4. PARAMETERIZED PUBLIC ENDPOINTS ─────────────────────────────────────

    @Get(':id/tickets')
    @ApiOperation({ summary: 'Get active tickets for an event' })
    async getEventTickets(@Param('id') id: string) {
        return this.eventsService.getEventTickets(id);
    }
}
