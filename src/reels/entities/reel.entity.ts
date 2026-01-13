import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { Startup } from '../../startups/entities/startup.entity';
import { ReelLike } from './reel-like.entity';
import { ReelComment } from './reel-comment.entity';
import { ReelShare } from './reel-share.entity';

@Entity('reels')
export class Reel {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'startup_id' })
    @Index()
    startupId: string;

    @ManyToOne(() => Startup, (startup) => startup.reels, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'startup_id' })
    startup: Startup;

    @Column()
    title: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ name: 'video_url' })
    videoUrl: string;

    @Column({ name: 'thumbnail_url', nullable: true })
    thumbnailUrl: string;

    @Column({ type: 'int', nullable: true })
    duration: number;

    @Column({ name: 'view_count', default: 0 })
    viewCount: number;

    @Column({ name: 'like_count', default: 0 })
    likeCount: number;

    @Column({ name: 'comment_count', default: 0 })
    commentCount: number;

    @Column({ name: 'share_count', default: 0 })
    shareCount: number;

    @Column({ type: 'text', array: true, default: '{}' })
    @Index('idx_reels_hashtags', { synchronize: false })
    hashtags: string[];

    @Column({ name: 'is_featured', default: false })
    @Index()
    isFeatured: boolean;

    @CreateDateColumn({ name: 'created_at' })
    @Index()
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @DeleteDateColumn({ name: 'deleted_at' })
    deletedAt: Date;

    // Relations
    @OneToMany(() => ReelLike, (like) => like.reel)
    likes: ReelLike[];

    @OneToMany(() => ReelComment, (comment) => comment.reel)
    comments: ReelComment[];

    @OneToMany(() => ReelShare, (share) => share.reel)
    shares: ReelShare[];
}
