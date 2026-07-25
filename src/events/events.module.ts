import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from './entities/event.entity';
import { EventTicket } from './entities/event-ticket.entity';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { AuthGuardModule } from '../auth/auth-guard.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Event, EventTicket]),
        AuthGuardModule,
    ],
    controllers: [EventsController],
    providers: [EventsService],
    exports: [EventsService],
})
export class EventsModule {}
