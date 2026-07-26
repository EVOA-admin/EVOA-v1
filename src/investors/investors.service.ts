import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Investor } from './entities/investor.entity';
import { SubscriptionStatus, User, UserPlanType } from '../users/entities/user.entity';
import { CreateInvestorDto } from './dto/create-investor.dto';

@Injectable()
export class InvestorsService {
    constructor(
        @InjectRepository(Investor)
        private readonly investorRepository: Repository<Investor>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) { }

    // PAN regex validator (shared by create and update)
    private readonly PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

    private validatePan(pan: string | undefined): void {
        if (!pan || !pan.trim()) return;
        const val = pan.trim().toUpperCase();
        if (!this.PAN_REGEX.test(val)) {
            throw new BadRequestException('Invalid PAN format. Please check the entered number.');
        }
    }

    async create(userId: string, dto: CreateInvestorDto) {
        // Validate PAN format if provided, then normalise to uppercase
        this.validatePan((dto as any).panNumber);
        if ((dto as any).panNumber?.trim()) {
            (dto as any).panNumber = (dto as any).panNumber.trim().toUpperCase();
        }

        const investor = this.investorRepository.create({
            ...dto,
            userId,
        });

        const saved = await this.investorRepository.save(investor);

        // Sync registration name & avatar back to the users table so that
        // story bubbles, post headers, and all UI components show the
        // user's chosen identity instead of the Google email prefix.
        const userUpdate: Partial<User> = {};
        if (dto.name) userUpdate.fullName = dto.name;
        if (dto.logoUrl) userUpdate.avatarUrl = dto.logoUrl;

        // TEMPORARY: Subscription step is paused for Investors.
        // Set investor account to active and fully registered upon profile creation.
        userUpdate.planType = UserPlanType.INVESTOR_PREMIUM;
        userUpdate.subscriptionStatus = SubscriptionStatus.ACTIVE;
        userUpdate.isPremium = true;
        userUpdate.isPaymentPending = false;
        userUpdate.registrationCompleted = true;
        userUpdate.roleSelected = true;
        userUpdate.isLegacyUser = false;
        if (Object.keys(userUpdate).length > 0) {
            await this.userRepository.update({ id: userId }, userUpdate);
        }

        return saved;
    }

    async findMyInvestorProfile(userId: string) {
        return this.investorRepository.findOne({
            where: { userId },
            order: { createdAt: 'DESC' }
        });
    }

    async findOne(id: string) {
        return this.investorRepository.findOne({ where: { id } });
    }

    async updateMyProfile(userId: string, dto: Partial<CreateInvestorDto>) {
        // Validate PAN format if being updated
        this.validatePan((dto as any).panNumber);
        if ((dto as any).panNumber?.trim()) {
            (dto as any).panNumber = (dto as any).panNumber.trim().toUpperCase();
        }

        const investor = await this.findMyInvestorProfile(userId);
        if (!investor) {
            throw new NotFoundException('Investor profile not found');
        }

        Object.assign(investor, dto);
        const saved = await this.investorRepository.save(investor);

        // Keep users table in sync when profile is updated too
        const userUpdate: Partial<User> = {};
        if (dto.name) userUpdate.fullName = dto.name;
        if (dto.logoUrl) userUpdate.avatarUrl = dto.logoUrl;
        if (Object.keys(userUpdate).length > 0) {
            await this.userRepository.update({ id: userId }, userUpdate);
        }

        return saved;
    }
}
