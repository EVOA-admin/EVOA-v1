import { IsEmail, IsString, MinLength, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../users/entities/user.entity';

export class SignupDto {
    @ApiProperty({ example: 'user@example.com' })
    @IsEmail()
    email: string;

    @ApiProperty({ example: 'SecurePassword123!' })
    @IsString()
    @MinLength(8)
    password: string;

    @ApiProperty({ example: 'John Doe' })
    @IsString()
    fullName: string;

    @ApiPropertyOptional({ enum: UserRole, example: UserRole.VIEWER })
    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;
}

export class LoginDto {
    @ApiProperty({ example: 'user@example.com' })
    @IsEmail()
    email: string;

    @ApiProperty({ example: 'SecurePassword123!' })
    @IsString()
    password: string;
}

export class GoogleAuthDto {
    @ApiProperty({ example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6...' })
    @IsString()
    idToken: string;
}

export class ForgotPasswordDto {
    @ApiProperty({ example: 'user@example.com' })
    @IsEmail()
    email: string;
}

export class RegisterDto {
    @ApiProperty({ example: 'user@example.com' })
    @IsEmail()
    email: string;

    @ApiProperty({ example: 'SecurePassword123!' })
    @IsString()
    @MinLength(6)
    password: string;

    @ApiPropertyOptional()
    @IsOptional()
    metadata?: Record<string, any>;

    @ApiPropertyOptional({ example: 'http://localhost:5173/auth/callback' })
    @IsOptional()
    @IsString()
    redirectTo?: string;
}

export class ResendVerificationDto {
    @ApiProperty({ example: 'user@example.com' })
    @IsEmail()
    email: string;

    @ApiPropertyOptional({ example: 'http://localhost:5173/auth/callback' })
    @IsOptional()
    @IsString()
    redirectTo?: string;
}

