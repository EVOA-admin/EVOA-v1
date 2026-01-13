import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Reel } from './reel.entity';
import { User } from '../../users/entities/user.entity';

@Entity('reel_comments')
export class ReelComment {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'reel_id' })
    @Index()
    reelId: string;

    @ManyToOne(() => Reel, (reel) => reel.comments, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'reel_id' })
    reel: Reel;

    @Column({ name: 'user_id' })
    @Index()
    userId: string;

    @ManyToOne(() => User, (user) => user.reelComments, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ type: 'text' })
    content: string;

    @Column({ name: 'parent_comment_id', nullable: true })
    @Index()
    parentCommentId: string;

    @ManyToOne(() => ReelComment, { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'parent_comment_id' })
    parentComment: ReelComment;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @DeleteDateColumn({ name: 'deleted_at' })
    deletedAt: Date;
}
