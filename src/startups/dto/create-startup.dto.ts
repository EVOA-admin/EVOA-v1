import { IsString, IsNotEmpty, IsOptional, IsArray, IsNumber, IsEmail, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class FounderDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsEmail()
    @IsOptional()
    email?: string;

    @IsString()
    @IsOptional()
    mobile?: string;

    @IsString()
    @IsOptional()
    phone?: string;

    @IsString()
    @IsNotEmpty()
    role: string;

    @IsString()
    @IsOptional()
    photoUrl?: string;

    @IsString()
    @IsOptional()
    linkedin?: string;
}

class LocationDto {
    @IsString()
    @IsOptional()
    city?: string;

    @IsString()
    @IsOptional()
    state?: string;

    @IsString()
    @IsOptional()
    country?: string;
}

class VerificationDto {
    @IsString()
    @IsOptional()
    countryCode?: string;

    @IsString()
    @IsOptional()
    countryName?: string;

    @IsString()
    @IsOptional()
    registry?: string;

    @IsString()
    @IsOptional()
    idLabel?: string;

    @IsString()
    @IsOptional()
    secondaryIdLabel?: string;

    @IsString()
    @IsOptional()
    type?: string;

    @IsString()
    @IsOptional()
    value?: string;

    @IsString()
    @IsOptional()
    documentUrl?: string;

    @IsString()
    @IsOptional()
    entityType?: string;

    @IsString()
    @IsOptional()
    secondaryValue?: string;

    @IsString()
    @IsOptional()
    registrationStatus?: string;
}

// Use plain string validation — @IsUrl() rejects user-typed partial URLs
class SocialLinksDto {
    @IsString()
    @IsOptional()
    linkedin?: string;

    @IsString()
    @IsOptional()
    instagram?: string;

    @IsString()
    @IsOptional()
    youtube?: string;

    @IsString()
    @IsOptional()
    website?: string;

    @IsString()
    @IsOptional()
    playStore?: string;

    @IsString()
    @IsOptional()
    productDemo?: string;

    @IsString()
    @IsOptional()
    brochure?: string;
}

class TeamMemberDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    role: string;

    @IsString()
    @IsOptional()
    linkedin?: string;

    @IsString()
    @IsOptional()
    image?: string;
}

export class CreateStartupDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    username: string;

    @IsString()
    @IsOptional()
    tagline?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsString()
    @IsOptional()
    logoUrl?: string;

    @IsString()
    @IsOptional()
    website?: string;

    @IsString()
    @IsOptional()
    phone?: string;

    @IsString()
    @IsOptional()
    mobile?: string;

    @IsEmail()
    @IsOptional()
    companyEmail?: string;

    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    industries?: string[];

    @IsString()
    @IsOptional()
    stage?: string;

    // Location is optional — not all users fill city/state/country
    @ValidateNested()
    @Type(() => LocationDto)
    @IsOptional()
    location?: LocationDto;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => FounderDto)
    @IsOptional()
    founders?: FounderDto[];

    @ValidateNested()
    @Type(() => VerificationDto)
    @IsOptional()
    verification?: VerificationDto;

    @IsString()
    @IsOptional()
    pitchVideoUrl?: string;

    @IsString()
    @IsOptional()
    pitchDeckUrl?: string;

    @IsNumber()
    @IsOptional()
    revenue?: number;

    @IsNumber()
    @IsOptional()
    raisingAmount?: number;

    @IsNumber()
    @IsOptional()
    equityPercentage?: number;

    @IsNumber()
    @IsOptional()
    preMoneyValuation?: number;

    @IsString()
    @IsOptional()
    brochureUrl?: string;

    @ValidateNested()
    @Type(() => SocialLinksDto)
    @IsOptional()
    socialLinks?: SocialLinksDto;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => TeamMemberDto)
    @IsOptional()
    teamMembers?: TeamMemberDto[];

    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    categoryTags?: string[];

    // Hashtags string from the pitch form (e.g. "#ai #fintech")
    @IsString()
    @IsOptional()
    hashtags?: string;

    @IsString()
    @IsOptional()
    shortDescription?: string;
}
