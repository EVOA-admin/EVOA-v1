import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../users/entities/user.entity';
import { supabaseClient } from '../config/supabase.config';
import { SignupDto, LoginDto, GoogleAuthDto, ForgotPasswordDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        private readonly jwtService: JwtService,
    ) { }

    async signup(signupDto: SignupDto) {
        const { email, password, fullName, role } = signupDto;

        // Check if user exists
        const existingUser = await this.userRepository.findOne({ where: { email } });
        if (existingUser) {
            throw new ConflictException('User with this email already exists');
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user in database
        const user = this.userRepository.create({
            email,
            passwordHash,
            fullName,
            role: role || UserRole.VIEWER,
        });

        await this.userRepository.save(user);

        // Generate JWT
        const token = this.generateToken(user);

        return {
            user: this.sanitizeUser(user),
            token,
        };
    }

    async login(loginDto: LoginDto) {
        const { email, password } = loginDto;

        // Find user
        const user = await this.userRepository.findOne({ where: { email } });
        if (!user || !user.passwordHash) {
            throw new UnauthorizedException('Invalid credentials');
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        // Generate JWT
        const token = this.generateToken(user);

        return {
            user: this.sanitizeUser(user),
            token,
        };
    }

    async googleAuth(googleAuthDto: GoogleAuthDto) {
        const { idToken } = googleAuthDto;

        try {
            // Verify Google token with Supabase
            const { data, error } = await supabaseClient.auth.signInWithIdToken({
                provider: 'google',
                token: idToken,
            });

            if (error) throw new UnauthorizedException('Invalid Google token');

            const { user: supabaseUser } = data;

            // Find or create user
            let user = await this.userRepository.findOne({
                where: { supabaseUserId: supabaseUser.id },
            });

            if (!user) {
                user = this.userRepository.create({
                    email: supabaseUser.email,
                    fullName: supabaseUser.user_metadata?.full_name || supabaseUser.email,
                    avatarUrl: supabaseUser.user_metadata?.avatar_url,
                    supabaseUserId: supabaseUser.id,
                    role: UserRole.VIEWER,
                });
                await this.userRepository.save(user);
            }

            // Generate JWT
            const token = this.generateToken(user);

            return {
                user: this.sanitizeUser(user),
                token,
            };
        } catch (error) {
            throw new UnauthorizedException('Google authentication failed');
        }
    }

    async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
        const { email } = forgotPasswordDto;

        // Use Supabase to send password reset email
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: `${process.env.FRONTEND_URL}/reset-password`,
        });

        if (error) {
            throw new BadRequestException('Failed to send password reset email');
        }

        return {
            message: 'Password reset email sent successfully',
        };
    }

    async validateUser(userId: string): Promise<User> {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new UnauthorizedException('User not found');
        }
        return user;
    }

    private generateToken(user: User): string {
        const payload = {
            sub: user.id,
            email: user.email,
            role: user.role,
        };
        return this.jwtService.sign(payload);
    }

    private sanitizeUser(user: User) {
        const { passwordHash, ...sanitized } = user;
        return sanitized;
    }
}
