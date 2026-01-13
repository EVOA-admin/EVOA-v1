import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index, Unique } from 'typeorm';
import { Reel } from './reel.entity';
import { User } from '../../users/entities/user.entity';

@Entity('reel_likes')
@Unique(['reelId', 'userId'])
export class ReelLike {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'reel_id' })
    @Index()
    reelId: string;

    @ManyToOne(() => Reel, (reel) => reel.likes, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'reel_id' })
    reel: Reel;

    @Column({ name: 'user_id' })
    @Index()
    userId: string;

    @ManyToOne(() => User, (user) => user.reelLikes, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
