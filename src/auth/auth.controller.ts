import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto, ResendVerificationDto } from './dto/auth.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('register')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Register a new user with email and password and send verification email' })
    @ApiResponse({ status: 200, description: 'Verification email sent successfully' })
    @ApiResponse({ status: 400, description: 'Invalid payload or email generation failed' })
    @ApiResponse({ status: 409, description: 'User already exists and verified' })
    async register(@Body() registerDto: RegisterDto) {
        return this.authService.register(registerDto);
    }

    @Post('resend-verification')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Resend verification email to an unverified user' })
    @ApiResponse({ status: 200, description: 'Verification email resent successfully' })
    @ApiResponse({ status: 400, description: 'No unverified account found with provided email' })
    async resendVerification(@Body() resendDto: ResendVerificationDto) {
        return this.authService.resendVerification(resendDto);
    }
}

