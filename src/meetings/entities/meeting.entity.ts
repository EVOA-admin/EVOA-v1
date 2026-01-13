import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Startup } from '../../startups/entities/startup.entity';

export enum MeetingStatus {
    REQUESTED = 'requested',
    ACCEPTED = 'accepted',
    REJECTED = 'rejected',
    COMPLETED = 'completed',
}

@Entity('meetings')
export class Meeting {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'investor_id' })
    @Index()
    investorId: string;

    @ManyToOne(() => User, (user) => user.investorMeetings, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'investor_id' })
    investor: User;

    @Column({ name: 'startup_id' })
    @Index()
    startupId: string;

    @ManyToOne(() => Startup, (startup) => startup.meetings, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'startup_id' })
    startup: Startup;

    @Column({ name: 'founder_id' })
    @Index()
    founderId: string;

    @ManyToOne(() => User, (user) => user.founderMeetings, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'founder_id' })
    founder: User;

    @Column({
        type: 'enum',
        enum: MeetingStatus,
        default: MeetingStatus.REQUESTED,
    })
    @Index()
    status: MeetingStatus;

    @Column({ name: 'meeting_link', nullable: true })
    meetingLink: string;

    @Column({ name: 'scheduled_at', type: 'timestamp', nullable: true })
    scheduledAt: Date;

    @Column({ type: 'text', nullable: true })
    notes: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
