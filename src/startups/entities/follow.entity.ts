import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index, Unique } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Startup } from './startup.entity';

@Entity('follows')
@Unique(['followerId', 'startupId'])
export class Follow {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'follower_id' })
    @Index()
    followerId: string;

    @ManyToOne(() => User, (user) => user.follows, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'follower_id' })
    follower: User;

    @Column({ name: 'startup_id' })
    @Index()
    startupId: string;

    @ManyToOne(() => Startup, (startup) => startup.followers, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'startup_id' })
    startup: Startup;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
