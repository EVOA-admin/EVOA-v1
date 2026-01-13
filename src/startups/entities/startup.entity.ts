import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Reel } from '../../reels/entities/reel.entity';
import { Follow } from './follow.entity';
import { Meeting } from '../../meetings/entities/meeting.entity';
import { InvestorAiLog } from '../../ai/entities/investor-ai-log.entity';

@Entity('startups')
export class Startup {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'founder_id' })
    @Index()
    founderId: string;

    @ManyToOne(() => User, (user) => user.startups, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'founder_id' })
    founder: User;

    @Column()
    name: string;

    @Column({ length: 500, nullable: true })
    tagline: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ length: 100, nullable: true })
    @Index()
    industry: string;

    @Column({ length: 50, nullable: true })
    @Index()
    stage: string;

    @Column({ name: 'raising_amount', type: 'decimal', precision: 15, scale: 2, nullable: true })
    raisingAmount: number;

    @Column({ name: 'equity_percentage', type: 'decimal', precision: 5, scale: 2, nullable: true })
    equityPercentage: number;

    @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
    revenue: number;

    @Column({ nullable: true })
    website: string;

    @Column({ name: 'logo_url', nullable: true })
    logoUrl: string;

    @Column({ name: 'follower_count', default: 0 })
    followerCount: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @DeleteDateColumn({ name: 'deleted_at' })
    deletedAt: Date;

    // Relations
    @OneToMany(() => Reel, (reel) => reel.startup)
    reels: Reel[];

    @OneToMany(() => Follow, (follow) => follow.startup)
    followers: Follow[];

    @OneToMany(() => Meeting, (meeting) => meeting.startup)
    meetings: Meeting[];

    @OneToMany(() => InvestorAiLog, (log) => log.startup)
    aiLogs: InvestorAiLog[];
}
