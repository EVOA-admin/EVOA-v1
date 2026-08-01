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
        this.validatePan(dto.panNumber);
        if (dto.panNumber?.trim()) {
            dto.panNumber = dto.panNumber.trim().toUpperCase();
        }

        const investor = this.investorRepository.create({
            userId,
            name: dto.name,
            type: dto.type,
            designation: dto.designation,
            companyName: dto.companyName,
            tagline: dto.tagline,
            description: dto.description,
            website: dto.website,
            logoUrl: dto.logoUrl,
            sectors: dto.sectors || [],
            stages: dto.stages || [],
            minTicketSize: dto.minTicketSize,
            maxTicketSize: dto.maxTicketSize,
            location: dto.location,
            linkedin: dto.linkedin,
            stats: dto.stats,
            socialProof: dto.socialProof,
            credentials: dto.credentials || [],
        });

        const saved = await this.investorRepository.save(investor);

        // Sync registration name & avatar back to the users table
        const userUpdate: Partial<User> = {};
        if (dto.name) userUpdate.fullName = dto.name;
        if (dto.logoUrl) userUpdate.avatarUrl = dto.logoUrl;

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
        this.validatePan(dto.panNumber);
        if (dto.panNumber?.trim()) {
            dto.panNumber = dto.panNumber.trim().toUpperCase();
        }

        const investor = await this.findMyInvestorProfile(userId);
        if (!investor) {
            throw new NotFoundException('Investor profile not found');
        }

        if (dto.name !== undefined) investor.name = dto.name;
        if (dto.type !== undefined) investor.type = dto.type;
        if (dto.designation !== undefined) investor.designation = dto.designation;
        if (dto.companyName !== undefined) investor.companyName = dto.companyName;
        if (dto.tagline !== undefined) investor.tagline = dto.tagline;
        if (dto.description !== undefined) investor.description = dto.description;
        if (dto.website !== undefined) investor.website = dto.website;
        if (dto.logoUrl !== undefined) investor.logoUrl = dto.logoUrl;
        if (dto.sectors !== undefined) investor.sectors = dto.sectors;
        if (dto.stages !== undefined) investor.stages = dto.stages;
        if (dto.minTicketSize !== undefined) investor.minTicketSize = dto.minTicketSize;
        if (dto.maxTicketSize !== undefined) investor.maxTicketSize = dto.maxTicketSize;
        if (dto.location !== undefined) investor.location = dto.location;
        if (dto.linkedin !== undefined) investor.linkedin = dto.linkedin;
        if (dto.stats !== undefined) investor.stats = dto.stats;
        if (dto.socialProof !== undefined) investor.socialProof = dto.socialProof;
        if (dto.credentials !== undefined) investor.credentials = dto.credentials;

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
