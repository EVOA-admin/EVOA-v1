import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from './entities/event.entity';
import { EventTicket } from './entities/event-ticket.entity';
import { UserEventTicket } from './entities/user-event-ticket.entity';
import { User } from '../users/entities/user.entity';
import { EventsService } from './events.service';
import { EventPassPdfService } from './event-pass-pdf.service';
import { EventsController } from './events.controller';
import { AuthGuardModule } from '../auth/auth-guard.module';
import { MailModule } from '../mail/mail.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Event, EventTicket, UserEventTicket, User]),
        AuthGuardModule,
        MailModule,
    ],
    controllers: [EventsController],
    providers: [EventsService, EventPassPdfService],
    exports: [EventsService, EventPassPdfService],
})
export class EventsModule {}
