import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Incubator } from './entities/incubator.entity';
import { User } from '../users/entities/user.entity';
import { CreateIncubatorDto } from './dto/create-incubator.dto';

@Injectable()
export class IncubatorsService {
    constructor(
        @InjectRepository(Incubator)
        private readonly incubatorRepository: Repository<Incubator>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) { }

    async create(userId: string, dto: CreateIncubatorDto) {
        const incubator = this.incubatorRepository.create({
            userId,
            programTypes: dto.programTypes || [],
            tagline: dto.tagline || undefined,
            officialEmail: dto.officialEmail || undefined,
            description: dto.description || undefined,
            website: dto.website || undefined,
            logoUrl: dto.logoUrl || undefined,
            sectors: dto.sectors || [],
            stages: dto.stages || [],
            location: dto.location || undefined,
            applicationDeadline: dto.applicationDeadline ? new Date(dto.applicationDeadline) : undefined,
            cohortSize: dto.cohortSize || undefined,
            facilities: dto.facilities || [],
            gallery: dto.gallery || [],
            socialLinks: dto.socialLinks || undefined,
            stats: dto.stats || undefined,
            organizationType: dto.organizationType || undefined,
            affiliationType: dto.affiliationType || undefined,
            verificationDocumentType: dto.verificationDocumentType || undefined,
            verificationDocumentUrl: dto.verificationDocumentUrl || undefined,
            equityPolicy: dto.equityPolicy || undefined,
            fundingSupport: dto.fundingSupport || undefined,
            programDuration: dto.programDuration || undefined,
            numberOfMentors: dto.numberOfMentors || undefined,
            portfolioStartups: dto.portfolioStartups || undefined,
            phoneNumber: dto.phoneNumber || undefined,
            fullAddress: dto.fullAddress || undefined,
        });

        const saved = await this.incubatorRepository.save(incubator);

        // Sync registration name & logo to the users table
        const userUpdate: Partial<User> = {};
        if (dto.name) userUpdate.fullName = dto.name;
        if (dto.logoUrl) userUpdate.avatarUrl = dto.logoUrl;
        if (Object.keys(userUpdate).length > 0) {
            await this.userRepository.update({ id: userId }, userUpdate);
        }

        return saved;
    }

    async findMyIncubatorProfile(userId: string) {
        return this.incubatorRepository.findOne({
            where: { userId },
            order: { createdAt: 'DESC' }
        });
    }

    async findOne(id: string) {
        return this.incubatorRepository.findOne({ where: { id } });
    }

    async updateMyProfile(userId: string, dto: Partial<CreateIncubatorDto>) {
        const incubator = await this.findMyIncubatorProfile(userId);
        if (!incubator) {
            throw new NotFoundException('Incubator profile not found');
        }

        if (dto.programTypes !== undefined) incubator.programTypes = dto.programTypes;
        if (dto.tagline !== undefined) incubator.tagline = dto.tagline;
        if (dto.officialEmail !== undefined) incubator.officialEmail = dto.officialEmail;
        if (dto.description !== undefined) incubator.description = dto.description;
        if (dto.website !== undefined) incubator.website = dto.website;
        if (dto.logoUrl !== undefined) incubator.logoUrl = dto.logoUrl;
        if (dto.sectors !== undefined) incubator.sectors = dto.sectors;
        if (dto.stages !== undefined) incubator.stages = dto.stages;
        if (dto.location !== undefined) incubator.location = dto.location;
        if (dto.applicationDeadline !== undefined) incubator.applicationDeadline = dto.applicationDeadline ? new Date(dto.applicationDeadline) : (undefined as any);
        if (dto.cohortSize !== undefined) incubator.cohortSize = dto.cohortSize;
        if (dto.facilities !== undefined) incubator.facilities = dto.facilities;
        if (dto.gallery !== undefined) incubator.gallery = dto.gallery;
        if (dto.socialLinks !== undefined) incubator.socialLinks = dto.socialLinks;
        if (dto.stats !== undefined) incubator.stats = dto.stats;
        if (dto.organizationType !== undefined) incubator.organizationType = dto.organizationType;
        if (dto.affiliationType !== undefined) incubator.affiliationType = dto.affiliationType;
        if (dto.verificationDocumentType !== undefined) incubator.verificationDocumentType = dto.verificationDocumentType;
        if (dto.verificationDocumentUrl !== undefined) incubator.verificationDocumentUrl = dto.verificationDocumentUrl;
        if (dto.equityPolicy !== undefined) incubator.equityPolicy = dto.equityPolicy;
        if (dto.fundingSupport !== undefined) incubator.fundingSupport = dto.fundingSupport;
        if (dto.programDuration !== undefined) incubator.programDuration = dto.programDuration;
        if (dto.numberOfMentors !== undefined) incubator.numberOfMentors = dto.numberOfMentors;
        if (dto.portfolioStartups !== undefined) incubator.portfolioStartups = dto.portfolioStartups;
        if (dto.phoneNumber !== undefined) incubator.phoneNumber = dto.phoneNumber;
        if (dto.fullAddress !== undefined) incubator.fullAddress = dto.fullAddress;

        const saved = await this.incubatorRepository.save(incubator);

        const userUpdate: Partial<User> = {};
        if (dto.name) userUpdate.fullName = dto.name;
        if (dto.logoUrl) userUpdate.avatarUrl = dto.logoUrl;
        if (Object.keys(userUpdate).length > 0) {
            await this.userRepository.update({ id: userId }, userUpdate);
        }

        return saved;
    }
}
