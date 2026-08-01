import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn, ManyToOne, Index } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('investors')
export class Investor {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'user_id' })
    @Index()
    userId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column()
    name: string;

    @Column({ nullable: true })
    phone: string;

    @Column({ nullable: true })
    mobile: string;

    @Column({ nullable: true })
    type: string; // Angel, VC, PE, etc.

    @Column({ nullable: true })
    designation: string; // Partner, Founder, etc.

    @Column({ name: 'company_name', nullable: true })
    companyName: string;

    @Column({ nullable: true })
    tagline: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ nullable: true })
    website: string;

    @Column({ name: 'logo_url', nullable: true })
    logoUrl: string;

    @Column('text', { array: true, default: '{}' })
    sectors: string[];

    @Column('text', { array: true, default: '{}' })
    stages: string[];

    @Column({ name: 'min_ticket_size', type: 'decimal', precision: 15, scale: 2, nullable: true })
    minTicketSize: number;

    @Column({ name: 'max_ticket_size', type: 'decimal', precision: 15, scale: 2, nullable: true })
    maxTicketSize: number;

    @Column({ type: 'jsonb', nullable: true })
    location: { city: string; state: string; country: string };

    @Column({ nullable: true })
    linkedin: string;

    @Column({ type: 'jsonb', nullable: true, default: '{}' })
    stats: {
        startupsBacked: number;
        capitalDeployed: string;
        exits: number;
    };

    @Column({ type: 'jsonb', nullable: true, default: '[]' })
    socialProof: {
        quote: string;
        author: string;
        authorRole: string;
        authorAvatar: string;
    }[];

    @Column({ type: 'jsonb', nullable: true, default: '[]' })
    credentials: string[];

    @Column({ default: false })
    verified: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
