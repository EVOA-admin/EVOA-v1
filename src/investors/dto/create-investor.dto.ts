import { IsString, IsOptional, IsArray, IsNumber, IsObject } from 'class-validator';

export class CreateInvestorDto {
    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsString()
    mobile?: string;

    @IsOptional()
    @IsString()
    panNumber?: string;

    @IsOptional()
    @IsString()
    type?: string;

    @IsOptional()
    @IsString()
    designation?: string;

    @IsOptional()
    @IsString()
    companyName?: string;

    @IsOptional()
    @IsString()
    tagline?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
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
    @IsNumber()
    minTicketSize?: number;

    @IsOptional()
    @IsNumber()
    maxTicketSize?: number;

    @IsOptional()
    @IsObject()
    location?: { city: string; state: string; country: string };

    @IsOptional()
    @IsString()
    linkedin?: string;

    @IsOptional()
    @IsObject()
    stats?: { startupsBacked: number; capitalDeployed: string; exits: number };

    @IsOptional()
    @IsArray()
    socialProof?: { quote: string; author: string; authorRole: string; authorAvatar: string }[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    credentials?: string[];
}

