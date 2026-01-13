import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Reel } from './reel.entity';
import { User } from '../../users/entities/user.entity';

@Entity('reel_shares')
export class ReelShare {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'reel_id' })
    @Index()
    reelId: string;

    @ManyToOne(() => Reel, (reel) => reel.shares, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'reel_id' })
    reel: Reel;

    @Column({ name: 'user_id' })
    @Index()
    userId: string;

    @ManyToOne(() => User, (user) => user.reelShares, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ length: 50, nullable: true })
    platform: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
