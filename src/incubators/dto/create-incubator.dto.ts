import { IsString, IsOptional, IsUrl, IsArray, IsNumber, IsObject, IsDateString } from 'class-validator';

export class CreateIncubatorDto {
    @IsString()
    name: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    programTypes?: string[];

    @IsOptional()
    @IsString()
    tagline?: string;

    @IsOptional()
    @IsString()
    officialEmail?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsUrl()
    website?: string;

    @IsOptional()
    @IsString()
    logoUrl?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    sectors?: string[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    stages?: string[];

    @IsOptional()
    @IsObject()
    location?: { city: string; state: string; country: string };

    @IsOptional()
    @IsDateString()
    applicationDeadline?: string;

    @IsOptional()
    @IsNumber()
    cohortSize?: number;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    facilities?: string[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    gallery?: string[];

    @IsOptional()
    @IsString()
    organizationType?: string;

    @IsOptional()
    @IsString()
    affiliationType?: string;

    @IsOptional()
    @IsString()
    verificationDocumentType?: string;

    @IsOptional()
    @IsString()
    verificationDocumentUrl?: string;

    @IsOptional()
    @IsString()
    equityPolicy?: string;

    @IsOptional()
    @IsString()
    fundingSupport?: string;

    @IsOptional()
    @IsString()
    programDuration?: string;

    @IsOptional()
    @IsNumber()
    numberOfMentors?: number;

    @IsOptional()
    @IsString()
    portfolioStartups?: string;

    @IsOptional()
    @IsString()
    phoneNumber?: string;

    @IsOptional()
    @IsString()
    fullAddress?: string;

    @IsOptional()
    @IsObject()
    socialLinks?: { linkedin?: string; instagram?: string; youtube?: string; twitter?: string };

    @IsOptional()
    @IsObject()
    stats?: { startupsIncubated: number; fundsRaised: string; mentorsCount: number };
}
