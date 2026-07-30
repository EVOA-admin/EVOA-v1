import { BadGatewayException, BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHmac, randomBytes } from 'crypto';
import { PricingOrder } from './entities/pricing-order.entity';
import { User, UserPlanType, UserRole, SubscriptionStatus } from '../users/entities/user.entity';
import { Event, EventType } from '../events/entities/event.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { hasActivePremiumAccess } from '../users/user-access.util';

type PricingPayload = {
    startups: {
        title: string;
        description: string;
        features: string[];
        freePlan: {
            price: string;
            cta: string;
        };
        proPlan: {
            price: string;
            cta: string;
            features: string[];
        };
    };
    investors: {
        title: string;
        description: string;
        features: string[];
        freePlan: {
            price: string;
            cta: string;
        };
        premiumPlan: {
            price: string;
            cta: string;
            features: string[];
        };
    };
    ambassador: {
        title: string;
        description: string;
        features: string[];
        price: string;
        benefits: string[];
        cta: string;
    };
};

type PlanConfig = {
    amountPaise: number;
    role: UserRole;
    planType: UserPlanType;
    name: string;
};

type RazorpayOrderResponse = {
    id: string;
    amount: number;
    currency: string;
};

@Injectable()
export class PricingService {
    private readonly logger = new Logger(PricingService.name);

    constructor(
        @InjectRepository(PricingOrder)
        private readonly pricingOrderRepository: Repository<PricingOrder>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(Event)
        private readonly eventRepo: Repository<Event>,
    ) { }

    private readonly plans: Record<CreateOrderDto['planType'], PlanConfig> = {
        startup_pro: {
            amountPaise: 99900,
            role: UserRole.STARTUP,
            planType: UserPlanType.STARTUP_PRO,
            name: 'Startup Pro Subscription',
        },
        investor_premium: {
            amountPaise: 499900,
            role: UserRole.INVESTOR,
            planType: UserPlanType.INVESTOR_PREMIUM,
            name: 'Investor Premium Subscription',
        },
    };

    private get razorpayKeyId() {
        return (process.env.RAZORPAY_KEY_ID || '').trim();
    }

    private get razorpayKeySecret() {
        return (process.env.RAZORPAY_KEY_SECRET || '').trim();
    }

    private ensureRazorpayConfigured() {
        if (!this.razorpayKeyId || !this.razorpayKeySecret) {
            throw new InternalServerErrorException('Razorpay is not configured on the server.');
        }
    }

    private normalizeSubscription(user: User) {
        const wasExpired = user.subscriptionStatus === SubscriptionStatus.EXPIRED;

        if (user.subscriptionEndDate && new Date(user.subscriptionEndDate).getTime() <= Date.now()) {
            user.subscriptionStatus = SubscriptionStatus.EXPIRED;
            user.isPremium = false;
            user.isPaymentPending = false;
        }

        return {
            user,
            needsPersistence: user.subscriptionStatus === SubscriptionStatus.EXPIRED && !wasExpired,
        };
    }

    private async getFreshUser(userId: string) {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new ForbiddenException('User not found.');
        }

        const { user: normalizedUser, needsPersistence } = this.normalizeSubscription(user);

        if (needsPersistence) {
            await this.userRepository.update(
                { id: userId },
                {
                    isPremium: false,
                    isPaymentPending: false,
                    subscriptionStatus: SubscriptionStatus.EXPIRED,
                },
            );
        }

        return normalizedUser;
    }

    private async createRazorpayOrder(amountPaise: number, receipt: string, userId: string, planType: CreateOrderDto['planType']) {
        this.ensureRazorpayConfigured();

        let response: Response;
        try {
            response = await fetch('https://api.razorpay.com/v1/orders', {
                method: 'POST',
                headers: {
                    Authorization: `Basic ${Buffer.from(`${this.razorpayKeyId}:${this.razorpayKeySecret}`).toString('base64')}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    amount: amountPaise,
                    currency: 'INR',
                    receipt,
                    notes: {
                        userId,
                        planType,
                    },
                }),
            });
        } catch (error) {
            this.logger.error(`Failed to reach Razorpay while creating order for user ${userId} and plan ${planType}`, error instanceof Error ? error.stack : undefined);
            throw new BadGatewayException('Unable to reach Razorpay while creating the order.');
        }

        const payload = await response.json().catch(() => ({} as { error?: { description?: string } }));
        if (!response.ok || !('id' in payload) || typeof payload.id !== 'string') {
            this.logger.error(`Razorpay order creation failed for user ${userId} and plan ${planType}`, JSON.stringify({
                status: response.status,
                receipt,
                error: payload?.error?.description || 'Unknown Razorpay error',
            }));
            throw new BadRequestException(payload?.error?.description || 'Unable to create Razorpay order.');
        }

        return payload as RazorpayOrderResponse;
    }

    private generateReceipt(planType: CreateOrderDto['planType'], userId: string) {
        const compactPlan = planType === 'investor_premium' ? 'inv' : 'stp';
        const compactUserId = userId.replace(/-/g, '').slice(0, 10);
        const timestamp = Date.now().toString(36);
        const nonce = randomBytes(3).toString('hex');
        const receipt = `${compactPlan}_${compactUserId}_${timestamp}_${nonce}`;

        return receipt.slice(0, 40);
    }

    getPricing(): PricingPayload {
        return {
            startups: {
                title: 'For Startups',
                description: 'Turn your ideas into opportunities. Pitch, grow, and get discovered.',
                features: [
                    'Pitch your startup using reels',
                    'Access investor insights',
                    'Engagement analytics (basic)',
                    'Build visibility',
                ],
                freePlan: {
                    price: '₹0/month',
                    cta: 'Get Started',
                },
                proPlan: {
                    price: '₹999/month',
                    cta: 'Upgrade to Pro',
                    features: [
                        'upload more than one pitch videos',
                        'Priority visibility to investors',
                        'Featured placement in feeds',
                        'Access to premium investor network',
                    ],
                },
            },
            investors: {
                title: 'For Investors',
                description: 'Discover the next big thing before everyone else.',
                features: [
                    'Get advanced analytics',
                    'Get recomendations and analysis with Investor AI.',
                    'Discover curated pitches',
                    'Save and track startup',
                ],
                freePlan: {
                    price: 'Free Browsing (limited access)',
                    cta: 'Explore Startups',
                },
                premiumPlan: {
                    price: '₹4999/month',
                    cta: 'Go Premium',
                    features: [
                        'Full access to all startup data',
                        'Direct messaging with founders',
                        'Early access to top startups',
                        'Investor analytics dashboard',
                    ],
                },
            },
            ambassador: {
                title: 'Ambassador Program',
                description: 'Be the voice of Evoa. Grow with us and earn along the way.',
                features: [
                    'Represent Evoa in your network',
                    'Earn money on successful referrals',
                ],
                price: 'Free to join',
                benefits: [
                    'Incentives per referral',
                    'Exclusive community access',
                    'Recognition & leaderboard',
                ],
                cta: 'Join Program',
            },
        };
    }

    async createOrder(user: User, dto: CreateOrderDto) {
        const freshUser = await this.getFreshUser(user.id);
        const plan = this.plans[dto.planType];
        if (!plan) {
            throw new BadRequestException('Unsupported plan type.');
        }

        if (freshUser.role !== plan.role) {
            throw new ForbiddenException(`Only ${plan.role} users can create an order for this plan.`);
        }

        if (dto.planType === 'investor_premium' && freshUser.isLegacyUser) {
            throw new ForbiddenException('Existing investors do not require payment.');
        }

        if (hasActivePremiumAccess(freshUser) && freshUser.planType === plan.planType) {
            throw new BadRequestException('An active subscription already exists for this plan.');
        }

        const existingPending = await this.pricingOrderRepository.findOne({
            where: {
                userId: freshUser.id,
                planType: plan.planType,
                subscriptionStatus: SubscriptionStatus.PENDING,
            },
            order: { createdAt: 'DESC' },
        });

        if (existingPending?.razorpayOrderId) {
            return {
                orderId: existingPending.razorpayOrderId,
                amount: existingPending.amountPaise,
                currency: existingPending.currency,
                planType: dto.planType,
                planName: plan.name,
                razorpayKey: this.razorpayKeyId,
                subscriptionStatus: SubscriptionStatus.PENDING,
            };
        }

        const receipt = this.generateReceipt(dto.planType, freshUser.id);
        const razorpayOrder = await this.createRazorpayOrder(plan.amountPaise, receipt, freshUser.id, dto.planType);

        const order = this.pricingOrderRepository.create({
            userId: freshUser.id,
            planType: plan.planType,
            razorpayOrderId: razorpayOrder.id,
            paymentId: null,
            amountPaise: plan.amountPaise,
            currency: 'INR',
            subscriptionStatus: SubscriptionStatus.PENDING,
            providerSignature: null,
            verifiedAt: null,
        });

        await this.pricingOrderRepository.save(order);

        await this.userRepository.update(
            { id: freshUser.id },
            {
                isPremium: false,
                planType: plan.planType,
                subscriptionStatus: SubscriptionStatus.PENDING,
                subscriptionStartDate: null,
                subscriptionEndDate: null,
                isPaymentPending: dto.planType === 'investor_premium',
            },
        );

        return {
            orderId: razorpayOrder.id,
            planType: dto.planType,
            amount: plan.amountPaise,
            currency: 'INR',
            subscriptionStatus: SubscriptionStatus.PENDING,
            razorpayKey: this.razorpayKeyId,
            planName: plan.name,
        };
    }

    async verifyPayment(user: User, dto: VerifyPaymentDto) {
        this.ensureRazorpayConfigured();
        const freshUser = await this.getFreshUser(user.id);
        const plan = this.plans[dto.planType];
        if (!plan) {
            throw new BadRequestException('Unsupported plan type.');
        }

        const order = await this.pricingOrderRepository.findOne({
            where: {
                userId: freshUser.id,
                razorpayOrderId: dto.razorpayOrderId,
                planType: plan.planType,
            },
            order: { createdAt: 'DESC' },
        });

        if (!order) {
            throw new BadRequestException('Payment order not found.');
        }

        if (order.paymentId && order.subscriptionStatus === SubscriptionStatus.ACTIVE) {
            return {
                success: true,
                message: 'Payment already verified.',
                planType: dto.planType,
                subscriptionStatus: SubscriptionStatus.ACTIVE,
            };
        }

        if (order.paymentId && order.paymentId !== dto.razorpayPaymentId) {
            throw new BadRequestException('This order is already linked to a different payment.');
        }

        if (![SubscriptionStatus.PENDING, SubscriptionStatus.ACTIVE].includes(order.subscriptionStatus)) {
            throw new BadRequestException('This payment order is no longer valid for verification.');
        }

        const expectedSignature = createHmac('sha256', this.razorpayKeySecret)
            .update(`${dto.razorpayOrderId}|${dto.razorpayPaymentId}`)
            .digest('hex');

        if (expectedSignature !== dto.razorpaySignature) {
            throw new BadRequestException('Payment signature verification failed.');
        }

        const isEventOnly = order?.eventType === EventType.EVENT || order?.eventType === 'event_only' || order?.eventType === 'event';

        const subscriptionStartDate = new Date();
        const subscriptionEndDate = new Date(subscriptionStartDate.getTime() + 30 * 24 * 60 * 60 * 1000);

        await this.pricingOrderRepository.update(
            { id: order.id },
            {
                paymentId: dto.razorpayPaymentId,
                providerSignature: dto.razorpaySignature,
                subscriptionStatus: SubscriptionStatus.ACTIVE,
                verifiedAt: subscriptionStartDate,
            },
        );

        if (!isEventOnly) {
            // Event Type: Event + Evoa Subscription -> Grant 1-Month Evoa Subscription
            const userUpdate: Partial<User> = {
                isPremium: true,
                isPaymentPending: false,
                planType: plan.planType,
                subscriptionStatus: SubscriptionStatus.ACTIVE,
                subscriptionStartDate,
                subscriptionEndDate,
            };

            if (freshUser.role === UserRole.INVESTOR && plan.planType === UserPlanType.INVESTOR_PREMIUM) {
                userUpdate.registrationCompleted = true;
            }

            await this.userRepository.update({ id: freshUser.id }, userUpdate);
        }

        return {
            success: true,
            message: isEventOnly
                ? 'Event ticket purchased successfully.'
                : 'Payment verified successfully. Subscription activated.',
            planType: dto.planType,
            subscriptionStatus: SubscriptionStatus.ACTIVE,
            subscriptionStartDate: isEventOnly ? undefined : subscriptionStartDate,
            subscriptionEndDate: isEventOnly ? undefined : subscriptionEndDate,
        };
    }

    /**
     * Create a Razorpay order for an EVOA event pass.
     * Supports both "Event" (event_only) and "Event + Evoa Subscription" (event_with_subscription).
     */
    async createEventOrder(user: User, eventId?: string, amount?: number, eventTypeOverride?: string) {
        const freshUser = await this.getFreshUser(user.id);

        let event: Event | null = null;
        if (eventId) {
            event = await this.eventRepo.findOne({ where: { id: eventId } });
        }

        const resolvedEventType = eventTypeOverride || event?.eventType || EventType.EVENT_WITH_SUBSCRIPTION;
        const amountPaise = amount ? Math.round(amount * 100) : 99900;
        const planName = event?.title ? `${event.title} Pass` : 'EVOA Event Pass';

        const receipt = this.generateReceipt('startup_pro', freshUser.id);
        const razorpayOrder = await this.createRazorpayOrder(
            amountPaise,
            receipt,
            freshUser.id,
            'startup_pro',
        );

        const order = this.pricingOrderRepository.create({
            userId: freshUser.id,
            planType: UserPlanType.STARTUP_PRO,
            razorpayOrderId: razorpayOrder.id,
            eventId: eventId || null,
            eventType: resolvedEventType,
            paymentId: null,
            amountPaise,
            currency: 'INR',
            subscriptionStatus: SubscriptionStatus.PENDING,
            providerSignature: null,
            verifiedAt: null,
        });

        await this.pricingOrderRepository.save(order);

        return {
            orderId: razorpayOrder.id,
            planType: 'startup_pro',
            amount: amountPaise,
            currency: 'INR',
            subscriptionStatus: SubscriptionStatus.PENDING,
            razorpayKey: this.razorpayKeyId,
            planName,
            eventType: resolvedEventType,
        };
    }
}
