import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import { BattlegroundRegistration, BattlegroundPaymentStatus } from '../battleground/entities/battleground-registration.entity';
import { PricingOrder } from '../pricing/entities/pricing-order.entity';
import { Reel } from '../reels/entities/reel.entity';
import { Investor } from '../investors/entities/investor.entity';
import { Startup } from '../startups/entities/startup.entity';
import { SubscriptionStatus, User, UserPlanType, UserRole } from '../users/entities/user.entity';
import {
    AddBattlegroundStartupDto,
    AdminInvestorsQueryDto,
    AdminStartupsQueryDto,
    AdminUsersQueryDto,
    DeclareBattlegroundWinnerDto,
    UpdateAdminInvestorDto,
    UpdateAdminStartupDto,
    UpdateAdminUserDto,
    UpdateBattlegroundRegistrationDto,
} from './dto/admin.dto';
import { BattlegroundAdminState } from './entities/battleground-admin-state.entity';

@Injectable()
export class AdminService implements OnModuleInit {
    constructor(
        private readonly dataSource: DataSource,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(Startup)
        private readonly startupRepository: Repository<Startup>,
        @InjectRepository(Investor)
        private readonly investorRepository: Repository<Investor>,
        @InjectRepository(Reel)
        private readonly reelRepository: Repository<Reel>,
        @InjectRepository(BattlegroundRegistration)
        private readonly battlegroundRegistrationRepository: Repository<BattlegroundRegistration>,
        @InjectRepository(PricingOrder)
        private readonly pricingOrderRepository: Repository<PricingOrder>,
        @InjectRepository(BattlegroundAdminState)
        private readonly battlegroundAdminStateRepository: Repository<BattlegroundAdminState>,
    ) { }

    async onModuleInit() {
        try {
            await this.dataSource.query(`
                ALTER TABLE pricing_orders ADD COLUMN IF NOT EXISTS event_id varchar NULL;
                ALTER TABLE pricing_orders ADD COLUMN IF NOT EXISTS event_type varchar NULL;
                ALTER TABLE startups ADD COLUMN IF NOT EXISTS company_email varchar NULL;
                ALTER TABLE startups ADD COLUMN IF NOT EXISTS phone varchar NULL;
                ALTER TABLE startups ADD COLUMN IF NOT EXISTS mobile varchar NULL;
                ALTER TABLE investors ADD COLUMN IF NOT EXISTS phone varchar NULL;
                ALTER TABLE investors ADD COLUMN IF NOT EXISTS mobile varchar NULL;
            `);
        } catch (err) {
            console.warn('[AdminService] Schema auto-patch notice:', err?.message);
        }
    }

    private computeUserStatus(user: User) {
        if (user.isActive === false) return 'inactive';
        if (!user.registrationCompleted) return 'pending';
        return 'active';
    }

    private mapUserPlan(user: User) {
        return user.isPremium ? 'premium' : 'free';
    }

    private applyPremiumState(user: User, enabled: boolean) {
        if (enabled) {
            const start = user.subscriptionStartDate || new Date();
            const end = user.subscriptionEndDate || new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
            user.isPremium = true;
            user.isPaymentPending = false;
            user.subscriptionStatus = SubscriptionStatus.ACTIVE;
            user.subscriptionStartDate = start;
            user.subscriptionEndDate = end;
            if (user.role === UserRole.STARTUP) {
                user.planType = UserPlanType.STARTUP_PRO;
            }
            if (user.role === UserRole.INVESTOR) {
                user.planType = UserPlanType.INVESTOR_PREMIUM;
            }
            return;
        }

        user.isPremium = false;
        user.isPaymentPending = false;
        user.subscriptionStatus = SubscriptionStatus.FREE;
        user.subscriptionStartDate = null;
        user.subscriptionEndDate = null;
        user.planType = UserPlanType.FREE;
    }

    private async getBattlegroundState() {
        const [existingState] = await this.battlegroundAdminStateRepository.find({
            order: { createdAt: 'ASC' },
            take: 1,
        });
        let state = existingState;

        if (!state) {
            state = this.battlegroundAdminStateRepository.create({
                prizeTitle: 'Evoa Battleground Winner',
                prizeDescription: 'Admin-managed grand prize for the winning startup.',
                prizeAmount: 'To be announced',
            });
            state = await this.battlegroundAdminStateRepository.save(state);
        }

        return state;
    }

    private async findStartupOrThrow(startupId: string) {
        const startup = await this.startupRepository.findOne({
            where: { id: startupId },
            relations: ['founder', 'reels'],
        });

        if (!startup) {
            throw new NotFoundException('Startup not found.');
        }

        return startup;
    }

    private async findReelForStartup(startupId: string, reelId?: string | null) {
        if (reelId === null) return null;

        if (reelId) {
            const reel = await this.reelRepository.findOne({ where: { id: reelId, startupId } });
            if (!reel) {
                throw new BadRequestException('Pitch not found for this startup.');
            }
            return reel;
        }

        return this.reelRepository.findOne({
            where: { startupId },
            order: { createdAt: 'DESC' },
        });
    }

    private async syncBattlegroundPitchSelection(startupId: string, reelId: string | null) {
        await this.startupRepository.update({ id: startupId }, { selectedBattlegroundReelId: reelId });
        await this.battlegroundRegistrationRepository.update(
            { startupId, paymentStatus: BattlegroundPaymentStatus.SUCCESS },
            { selectedReelId: reelId },
        );
    }

    async getSession(user: User) {
        return {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            companyName: user.company || null,
            role: user.role,
        };
    }

    async getOverview() {
        try {
            const [totalUsers, totalStartups, totalInvestors, activeSubscriptions, totalBattlegroundParticipants] = await Promise.all([
                this.userRepository.count().catch(() => 0),
                this.startupRepository.count().catch(() => 0),
                this.userRepository.count({ where: { role: UserRole.INVESTOR } }).catch(() => 0),
                this.userRepository.count({ where: { isPremium: true, subscriptionStatus: SubscriptionStatus.ACTIVE } }).catch(() => 0),
                this.battlegroundRegistrationRepository.count({ where: { paymentStatus: BattlegroundPaymentStatus.SUCCESS } }).catch(() => 0),
            ]);

            let pricingRevenue = 0;
            try {
                const rawPricing = await this.pricingOrderRepository
                    .createQueryBuilder('po')
                    .select('SUM(po.amount_paise)', 'sum')
                    .where('po.payment_id IS NOT NULL')
                    .getRawOne();
                pricingRevenue = Number(rawPricing?.sum || 0);
            } catch (err) {
                console.warn('Failed to fetch pricing revenue:', err?.message);
            }

            let battlegroundTotal = 0;
            try {
                const rawBg = await this.battlegroundRegistrationRepository
                    .createQueryBuilder('bg')
                    .select('SUM(bg.amount_paise)', 'sum')
                    .where('bg.payment_status = :status', { status: BattlegroundPaymentStatus.SUCCESS })
                    .getRawOne();
                battlegroundTotal = Number(rawBg?.sum || 0);
            } catch (err) {
                console.warn('Failed to fetch battleground revenue:', err?.message);
            }

            return {
                totalUsers,
                totalStartups,
                totalInvestors,
                activeSubscriptions,
                totalRevenue: (pricingRevenue + battlegroundTotal) / 100,
                totalRevenuePaise: pricingRevenue + battlegroundTotal,
                totalBattlegroundParticipants,
            };
        } catch (err) {
            console.error('Error in getOverview:', err);
            return {
                totalUsers: 0,
                totalStartups: 0,
                totalInvestors: 0,
                activeSubscriptions: 0,
                totalRevenue: 0,
                totalRevenuePaise: 0,
                totalBattlegroundParticipants: 0,
            };
        }
    }

    async getUsers(query: AdminUsersQueryDto) {
        const where: any[] = [];
        const search = query.search?.trim();

        if (search) {
            where.push({ fullName: ILike(`%${search}%`) });
            where.push({ email: ILike(`%${search}%`) });
        }

        const users = await this.userRepository.find({
            where: where.length ? where : undefined,
            order: { createdAt: 'DESC' },
        });

        return users
            .filter((user) => !query.role || user.role === query.role)
            .filter((user) => !query.plan || this.mapUserPlan(user) === query.plan)
            .filter((user) => !query.status || this.computeUserStatus(user) === query.status)
            .map((user) => ({
                id: user.id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                plan: this.mapUserPlan(user),
                status: this.computeUserStatus(user),
                isActive: user.isActive !== false,
                isPremium: user.isPremium,
                isLegacyUser: user.isLegacyUser,
                createdAt: user.createdAt,
            }));
    }

    async updateUser(userId: string, dto: UpdateAdminUserDto) {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new NotFoundException('User not found.');
        }

        if (dto.role) {
            user.role = dto.role;
            user.roleSelected = true;
            user.registrationCompleted = true;
        }

        if (typeof dto.isActive === 'boolean') {
            user.isActive = dto.isActive;
        }

        if (typeof dto.isLegacyUser === 'boolean') {
            user.isLegacyUser = dto.isLegacyUser;
            if (dto.isLegacyUser) {
                user.isPaymentPending = false;
            }
        }

        if (typeof dto.isPremium === 'boolean') {
            this.applyPremiumState(user, dto.isPremium);
        }

        await this.userRepository.save(user);
        return {
            success: true,
            user: {
                id: user.id,
                role: user.role,
                plan: this.mapUserPlan(user),
                status: this.computeUserStatus(user),
                isActive: user.isActive,
                isPremium: user.isPremium,
                isLegacyUser: user.isLegacyUser,
            },
        };
    }

    async getStartups(query: AdminStartupsQueryDto) {
        const startups = await this.startupRepository.find({
            relations: ['founder', 'reels'],
            order: { createdAt: 'DESC' },
        });

        const registrations = await this.battlegroundRegistrationRepository.find({
            where: { paymentStatus: BattlegroundPaymentStatus.SUCCESS },
        });
        const participatingIds = new Set(registrations.map((registration) => registration.startupId));

        return startups
            .filter((startup) => {
                if (!query.search?.trim()) return true;
                const value = query.search.trim().toLowerCase();
                return (
                    startup.name?.toLowerCase().includes(value) ||
                    startup.founder?.fullName?.toLowerCase().includes(value)
                );
            })
            .filter((startup) => {
                if (!query.plan || query.plan === 'all') return true;
                return query.plan === 'premium' ? !!startup.founder?.isPremium : !startup.founder?.isPremium;
            })
            .filter((startup) => {
                if (!query.battleground || query.battleground === 'all') return true;
                const participating = participatingIds.has(startup.id);
                return query.battleground === 'participating' ? participating : !participating;
            })
            .map((startup) => ({
                id: startup.id,
                name: startup.name,
                founderName: startup.founder?.fullName || 'Unknown founder',
                founderEmail: startup.founder?.email || null,
                pitchCount: startup.reels?.length || 0,
                isPremium: !!startup.founder?.isPremium,
                isBattlegroundParticipant: participatingIds.has(startup.id),
                selectedBattlegroundReelId: startup.selectedBattlegroundReelId,
                pitches: (startup.reels || [])
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((reel) => ({
                        id: reel.id,
                        title: reel.title,
                        createdAt: reel.createdAt,
                        thumbnailUrl: reel.thumbnailUrl,
                    })),
            }));
    }

    async updateStartup(startupId: string, dto: UpdateAdminStartupDto) {
        const startup = await this.findStartupOrThrow(startupId);

        if (typeof dto.forcePremium === 'boolean') {
            const founder = await this.userRepository.findOne({ where: { id: startup.founderId } });
            if (!founder) {
                throw new NotFoundException('Startup founder not found.');
            }

            this.applyPremiumState(founder, dto.forcePremium);
            await this.userRepository.save(founder);
        }

        if (dto.selectedBattlegroundReelId !== undefined) {
            const reel = await this.findReelForStartup(startup.id, dto.selectedBattlegroundReelId);
            await this.syncBattlegroundPitchSelection(startup.id, reel?.id || null);
        }

        return { success: true };
    }

    async removeStartupPitch(startupId: string, reelId: string) {
        const startup = await this.findStartupOrThrow(startupId);
        const reel = await this.reelRepository.findOne({ where: { id: reelId, startupId } });

        if (!reel) {
            throw new NotFoundException('Pitch not found.');
        }

        await this.reelRepository.delete({ id: reel.id });

        if (startup.selectedBattlegroundReelId === reel.id) {
            await this.syncBattlegroundPitchSelection(startup.id, null);
        } else {
            await this.battlegroundRegistrationRepository.update(
                { startupId: startup.id, selectedReelId: reel.id },
                { selectedReelId: null },
            );
        }

        return { success: true };
    }

    async getInvestors(query: AdminInvestorsQueryDto) {
        const investors = await this.investorRepository.find({
            relations: ['user'],
            order: { createdAt: 'DESC' },
        });

        return investors
            .filter((investor) => {
                if (!query.search?.trim()) return true;
                const value = query.search.trim().toLowerCase();
                return (
                    investor.name?.toLowerCase().includes(value) ||
                    investor.user?.email?.toLowerCase().includes(value) ||
                    investor.companyName?.toLowerCase().includes(value)
                );
            })
            .filter((investor) => {
                if (!query.plan || query.plan === 'all') return true;
                return query.plan === 'premium' ? !!investor.user?.isPremium : !investor.user?.isPremium;
            })
            .filter((investor) => {
                if (!query.legacy || query.legacy === 'all') return true;
                return query.legacy === 'legacy' ? !!investor.user?.isLegacyUser : !investor.user?.isLegacyUser;
            })
            .filter((investor) => {
                if (!query.paymentStatus || query.paymentStatus === 'all') return true;
                if (query.paymentStatus === 'pending') return investor.user?.isPaymentPending;
                if (query.paymentStatus === 'active') return investor.user?.subscriptionStatus === SubscriptionStatus.ACTIVE;
                return investor.user?.subscriptionStatus === SubscriptionStatus.FREE;
            })
            .map((investor) => ({
                id: investor.id,
                userId: investor.userId,
                name: investor.name,
                email: investor.user?.email || null,
                companyName: investor.companyName,
                paymentStatus: investor.user?.subscriptionStatus || SubscriptionStatus.FREE,
                isPremium: !!investor.user?.isPremium,
                isLegacyUser: !!investor.user?.isLegacyUser,
                isPaymentPending: !!investor.user?.isPaymentPending,
                createdAt: investor.createdAt,
            }));
    }

    async updateInvestor(userId: string, dto: UpdateAdminInvestorDto) {
        const user = await this.userRepository.findOne({ where: { id: userId, role: UserRole.INVESTOR } });
        if (!user) {
            throw new NotFoundException('Investor user not found.');
        }

        if (typeof dto.grantPremium === 'boolean') {
            this.applyPremiumState(user, dto.grantPremium);
        }

        if (typeof dto.isLegacyUser === 'boolean') {
            user.isLegacyUser = dto.isLegacyUser;
            if (dto.isLegacyUser) {
                user.isPaymentPending = false;
            }
        }

        if (dto.resetPaymentStatus) {
            user.isPaymentPending = false;
            user.isPremium = false;
            user.subscriptionStatus = SubscriptionStatus.FREE;
            user.subscriptionStartDate = null;
            user.subscriptionEndDate = null;
            user.planType = UserPlanType.FREE;
        }

        await this.userRepository.save(user);
        return { success: true };
    }

    async getBattleground() {
        const [state, registrations] = await Promise.all([
            this.getBattlegroundState(),
            this.battlegroundRegistrationRepository.find({
                relations: ['startup', 'startup.founder', 'selectedReel'],
                order: { verifiedAt: 'DESC', createdAt: 'DESC' },
            }),
        ]);

        return {
            prize: {
                title: state.prizeTitle,
                description: state.prizeDescription,
                amount: state.prizeAmount,
            },
            winner: state.winnerStartupId
                ? {
                    startupId: state.winnerStartupId,
                    reelId: state.winnerReelId,
                    declaredAt: state.winnerDeclaredAt,
                }
                : null,
            participants: registrations.map((registration) => ({
                id: registration.id,
                startupId: registration.startupId,
                startupName: registration.startup?.name || 'Startup',
                founderName: registration.startup?.founder?.fullName || 'Founder',
                paymentStatus: registration.paymentStatus,
                selectedReelId: registration.selectedReelId,
                selectedPitchTitle: registration.selectedReel?.title || null,
                verifiedAt: registration.verifiedAt,
                isWinner: state.winnerStartupId === registration.startupId,
            })),
        };
    }

    async addBattlegroundStartup(dto: AddBattlegroundStartupDto) {
        const startup = await this.findStartupOrThrow(dto.startupId);
        const selectedReel = await this.findReelForStartup(startup.id, dto.reelId);
        const existing = await this.battlegroundRegistrationRepository.findOne({
            where: { startupId: startup.id, paymentStatus: BattlegroundPaymentStatus.SUCCESS },
        });

        if (existing) {
            throw new BadRequestException('Startup is already in battleground.');
        }

        const registration = this.battlegroundRegistrationRepository.create({
            userId: startup.founderId,
            startupId: startup.id,
            selectedReelId: selectedReel?.id || null,
            razorpayOrderId: `admin_manual_${startup.id.slice(0, 12)}_${Date.now()}`,
            paymentId: `admin_manual_${Date.now()}`,
            amountPaise: 0,
            currency: 'INR',
            paymentStatus: BattlegroundPaymentStatus.SUCCESS,
            providerSignature: 'admin_override',
            failureReason: null,
            verifiedAt: new Date(),
        });

        await this.battlegroundRegistrationRepository.save(registration);
        await this.syncBattlegroundPitchSelection(startup.id, selectedReel?.id || null);

        return { success: true };
    }

    async updateBattlegroundRegistration(registrationId: string, dto: UpdateBattlegroundRegistrationDto) {
        const registration = await this.battlegroundRegistrationRepository.findOne({
            where: { id: registrationId },
        });

        if (!registration) {
            throw new NotFoundException('Battleground registration not found.');
        }

        const reel = await this.findReelForStartup(registration.startupId, dto.selectedReelId);
        await this.battlegroundRegistrationRepository.update(
            { id: registrationId },
            { selectedReelId: reel?.id || null },
        );
        await this.syncBattlegroundPitchSelection(registration.startupId, reel?.id || null);

        return { success: true };
    }

    async removeBattlegroundRegistration(registrationId: string) {
        const registration = await this.battlegroundRegistrationRepository.findOne({
            where: { id: registrationId },
        });

        if (!registration) {
            throw new NotFoundException('Battleground registration not found.');
        }

        await this.battlegroundRegistrationRepository.delete({ id: registrationId });
        await this.syncBattlegroundPitchSelection(registration.startupId, null);

        const state = await this.getBattlegroundState();
        if (state.winnerStartupId === registration.startupId) {
            state.winnerStartupId = null;
            state.winnerReelId = null;
            state.winnerDeclaredAt = null;
            await this.battlegroundAdminStateRepository.save(state);
        }

        return { success: true };
    }

    async declareBattlegroundWinner(dto: DeclareBattlegroundWinnerDto) {
        const state = await this.getBattlegroundState();
        const startup = await this.findStartupOrThrow(dto.startupId);
        const reel = await this.findReelForStartup(startup.id, dto.reelId);

        state.winnerStartupId = startup.id;
        state.winnerReelId = reel?.id || startup.selectedBattlegroundReelId || null;
        state.winnerDeclaredAt = new Date();
        if (dto.prizeTitle !== undefined) state.prizeTitle = dto.prizeTitle;
        if (dto.prizeDescription !== undefined) state.prizeDescription = dto.prizeDescription;
        if (dto.prizeAmount !== undefined) state.prizeAmount = dto.prizeAmount;

        await this.battlegroundAdminStateRepository.save(state);

        return { success: true };
    }

    async getPayments() {
        const [pricingOrders, battlegroundOrders] = await Promise.all([
            this.pricingOrderRepository.find({
                relations: ['user'],
                order: { createdAt: 'DESC' },
            }),
            this.battlegroundRegistrationRepository.find({
                relations: ['user', 'startup'],
                order: { createdAt: 'DESC' },
            }),
        ]);

        const subscriptionPayments = pricingOrders.map((order) => ({
            id: order.id,
            type: 'subscription',
            userId: order.userId,
            userEmail: order.user?.email || null,
            userName: order.user?.fullName || null,
            planType: order.planType,
            amount: order.amountPaise / 100,
            amountPaise: order.amountPaise,
            status: order.paymentId ? 'success' : order.subscriptionStatus,
            paymentId: order.paymentId,
            razorpayOrderId: order.razorpayOrderId,
            createdAt: order.createdAt,
        }));

        const battlegroundPayments = battlegroundOrders.map((order) => ({
            id: order.id,
            type: 'battleground',
            userId: order.userId,
            userEmail: order.user?.email || null,
            userName: order.user?.fullName || order.startup?.name || null,
            planType: 'startup_battleground',
            amount: order.amountPaise / 100,
            amountPaise: order.amountPaise,
            status: order.paymentStatus,
            paymentId: order.paymentId,
            razorpayOrderId: order.razorpayOrderId,
            createdAt: order.createdAt,
        }));

        return [...subscriptionPayments, ...battlegroundPayments].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
    }
}
