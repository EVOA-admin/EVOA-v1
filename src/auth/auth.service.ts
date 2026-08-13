import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../users/entities/user.entity';
import { supabaseClient, supabaseAdmin } from '../config/supabase.config';
import { SignupDto, LoginDto, GoogleAuthDto, ForgotPasswordDto, RegisterDto, ResendVerificationDto } from './dto/auth.dto';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        private readonly jwtService: JwtService,
        private readonly mailService: MailService,
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

    async register(registerDto: RegisterDto) {
        const { email, password, metadata, redirectTo } = registerDto;
        const normalizedEmail = email.trim().toLowerCase();

        const defaultFrontend = process.env.FRONTEND_URL || 'http://localhost:5173';
        let callbackUrl = (redirectTo || defaultFrontend).trim();
        if (!callbackUrl.includes('/auth/callback')) {
            callbackUrl = `${callbackUrl.replace(/\/$/, '')}/auth/callback`;
        }

        let user;
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
        if (listData?.users) {
            const existing = (listData.users as any[]).find((u: any) => u.email?.toLowerCase() === normalizedEmail);
            if (existing) {
                if (existing.email_confirmed_at) {
                    throw new ConflictException('User is already registered and verified. Please log in.');
                }
                const { data: updated, error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
                    existing.id,
                    { password, user_metadata: metadata || {} }
                );
                if (updateErr) {
                    throw new BadRequestException(updateErr.message);
                }
                user = updated.user;
            }
        }

        if (!user) {
            const { data: createData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
                email: normalizedEmail,
                password,
                user_metadata: metadata || {},
                email_confirm: false,
            });

            if (createErr || !createData?.user) {
                throw new BadRequestException(createErr?.message || 'Failed to create user account.');
            }
            user = createData.user;
        }

        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
            type: 'signup',
            email: normalizedEmail,
            password,
            options: { redirectTo: callbackUrl },
        });

        if (linkErr || !linkData?.properties?.action_link) {
            throw new BadRequestException(linkErr?.message || 'Failed to generate verification link.');
        }

        const actionLink = linkData.properties.action_link;

        await this.mailService.sendVerificationEmail(normalizedEmail, actionLink);

        return {
            success: true,
            message: 'Verification email sent. Check your inbox.',
            user: {
                id: user.id,
                email: user.email,
            },
        };
    }

    async resendVerification(resendDto: ResendVerificationDto) {
        const { email, redirectTo } = resendDto;
        const normalizedEmail = email.trim().toLowerCase();

        const defaultFrontend = process.env.FRONTEND_URL || 'http://localhost:5173';
        let callbackUrl = (redirectTo || defaultFrontend).trim();
        if (!callbackUrl.includes('/auth/callback')) {
            callbackUrl = `${callbackUrl.replace(/\/$/, '')}/auth/callback`;
        }

        const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
        if (listErr) {
            throw new BadRequestException(listErr.message);
        }

        const existing = ((listData?.users || []) as any[]).find((u: any) => u.email?.toLowerCase() === normalizedEmail);
        if (!existing) {
            throw new BadRequestException('No account found with this email address.');
        }

        if (existing.email_confirmed_at) {
            return {
                success: true,
                message: 'Your account is already verified. You can log in directly.',
            };
        }

        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: normalizedEmail,
            options: { redirectTo: callbackUrl },
        });

        if (linkErr || !linkData?.properties?.action_link) {
            throw new BadRequestException(linkErr?.message || 'Failed to generate verification link.');
        }

        const actionLink = linkData.properties.action_link;

        await this.mailService.sendVerificationEmail(normalizedEmail, actionLink);

        return {
            success: true,
            message: 'Verification email sent! Check your inbox.',
        };
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
