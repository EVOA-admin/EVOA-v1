import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User, SubscriptionStatus, UserPlanType } from '../../users/entities/user.entity';

@Entity('pricing_orders')
export class PricingOrder {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'user_id' })
    @Index()
    userId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({
        name: 'plan_type',
        type: 'enum',
        enum: UserPlanType,
    })
    planType: UserPlanType;

    @Column({ name: 'razorpay_order_id', unique: true })
    @Index()
    razorpayOrderId: string;

    @Column({ name: 'event_id', type: 'varchar', nullable: true })
    eventId: string | null;

    @Column({ name: 'event_type', type: 'varchar', nullable: true })
    eventType: string | null;

    @Column({ name: 'payment_id', type: 'varchar', length: 255, unique: true, nullable: true })
    @Index()
    paymentId: string | null;

    @Column({ name: 'amount_paise', type: 'integer' })
    amountPaise: number;

    @Column({ length: 3, default: 'INR' })
    currency: string;

    @Column({
        name: 'subscription_status',
        type: 'enum',
        enum: SubscriptionStatus,
        default: SubscriptionStatus.PENDING,
    })
    subscriptionStatus: SubscriptionStatus;

    @Column({ name: 'provider_signature', type: 'varchar', length: 255, nullable: true })
    providerSignature: string | null;

    @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
    verifiedAt: Date | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
