import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Meeting, MeetingStatus } from './entities/meeting.entity';
import { Startup } from '../startups/entities/startup.entity';
import { User } from '../users/entities/user.entity';
import { ScheduleMeetingDto } from './dto/meetings.dto';

@Injectable()
export class MeetingsService {
    constructor(
        @InjectRepository(Meeting)
        private readonly meetingRepository: Repository<Meeting>,
        @InjectRepository(Startup)
        private readonly startupRepository: Repository<Startup>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) { }

    async requestMeeting(investorId: string, startupId: string, dto: ScheduleMeetingDto) {
        const startup = await this.startupRepository.findOne({
            where: { id: startupId },
            relations: ['founder'],
        });

        if (!startup) {
            throw new NotFoundException('Startup not found');
        }

        const meeting = this.meetingRepository.create({
            investorId,
            startupId,
            founderId: startup.founderId,
            status: MeetingStatus.REQUESTED,
            notes: dto.notes,
            scheduledAt: dto.scheduledAt,
        });

        await this.meetingRepository.save(meeting);

        // TODO: Send notification to founder

        return meeting;
    }

    async acceptMeeting(meetingId: string, userId: string) {
        const meeting = await this.meetingRepository.findOne({
            where: { id: meetingId },
            relations: ['investor', 'founder', 'startup'],
        });

        if (!meeting) {
            throw new NotFoundException('Meeting not found');
        }

        if (meeting.founderId !== userId) {
            throw new ForbiddenException('Only the founder can accept this meeting');
        }

        meeting.status = MeetingStatus.ACCEPTED;
        await this.meetingRepository.save(meeting);

        // TODO: Send notification to investor

        return meeting;
    }

    async rejectMeeting(meetingId: string, userId: string) {
        const meeting = await this.meetingRepository.findOne({
            where: { id: meetingId },
        });

        if (!meeting) {
            throw new NotFoundException('Meeting not found');
        }

        if (meeting.founderId !== userId) {
            throw new ForbiddenException('Only the founder can reject this meeting');
        }

        meeting.status = MeetingStatus.REJECTED;
        await this.meetingRepository.save(meeting);

        // TODO: Send notification to investor

        return meeting;
    }

    async getUserMeetings(userId: string) {
        return this.meetingRepository.find({
            where: [
                { investorId: userId },
                { founderId: userId },
            ],
            relations: ['investor', 'founder', 'startup'],
            order: { createdAt: 'DESC' },
        });
    }
}
