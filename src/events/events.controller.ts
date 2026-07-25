import {
    Controller, Get, Post, Put, Patch, Delete, Param, Body, UseGuards, Query,
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
import { UserRole } from '../users/entities/user.entity';

@ApiTags('Events')
@Controller('events')
export class EventsController {
    constructor(private readonly eventsService: EventsService) {}

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

    @Get('admin/all')
    @UseGuards(SupabaseAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all events (admin only: includes drafts, archived)' })
    async getAllEventsAdmin() {
        return this.eventsService.getAllEventsAdmin();
    }

    @Post('admin/create')
    @UseGuards(SupabaseAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create new event (admin only)' })
    async createEvent(@Body() dto: CreateEventDto) {
        return this.eventsService.createEvent(dto);
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
    async setEventStatus(@Param('id') id: string, @Body('status') status: EventStatus) {
        return this.eventsService.setEventStatus(id, status);
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
    async updateEvent(@Param('id') id: string, @Body() dto: UpdateEventDto) {
        return this.eventsService.updateEvent(id, dto);
    }

    @Delete('admin/:id')
    @UseGuards(SupabaseAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Delete event (admin only)' })
    async deleteEvent(@Param('id') id: string) {
        return this.eventsService.deleteEvent(id);
    }

    // ── 4. PARAMETERIZED PUBLIC ENDPOINTS ─────────────────────────────────────

    @Get(':id/tickets')
    @ApiOperation({ summary: 'Get active tickets for an event' })
    async getEventTickets(@Param('id') id: string) {
        return this.eventsService.getEventTickets(id);
    }
}
