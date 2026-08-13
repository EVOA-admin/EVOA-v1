import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto, ResendVerificationDto, ForgotPasswordDto } from './dto/auth.dto';

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

    @Post('forgot-password')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Send password reset link to user email' })
    @ApiResponse({ status: 200, description: 'Password reset link sent successfully' })
    @ApiResponse({ status: 400, description: 'User not found or email delivery failed' })
    async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
        return this.authService.forgotPassword(forgotPasswordDto);
    }

    @Post('test-mail')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Diagnostic test endpoint to verify email delivery from current environment' })
    async testMail(@Body('email') email: string) {
        return this.authService.testMailDelivery(email);
    }
}

