import { Injectable, Logger, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
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
    private readonly logger = new Logger(AuthService.name);

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
        try {
            const { email, password, metadata, redirectTo } = registerDto;
            const normalizedEmail = email.trim().toLowerCase();

            const defaultFrontend = process.env.FRONTEND_URL || 'http://localhost:5173';
            let callbackUrl = (redirectTo || defaultFrontend).trim();
            if (!callbackUrl.includes('/auth/callback')) {
                callbackUrl = `${callbackUrl.replace(/\/$/, '')}/auth/callback`;
            }

            let user: any = null;

            // Generate signup link (this atomically creates the unverified user in Supabase Auth)
            const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
                type: 'signup',
                email: normalizedEmail,
                password,
                options: {
                    redirectTo: callbackUrl,
                    data: metadata || {},
                },
            });

            if (linkErr) {
                const errMsg = linkErr.message?.toLowerCase() || '';
                if (errMsg.includes('already registered') || errMsg.includes('already exists') || errMsg.includes('email_exists')) {
                    // User account already exists in Supabase Auth — check if confirmed or unconfirmed
                    const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
                    const usersList = listData?.users || [];
                    const existing = usersList.find((u: any) => u.email?.trim().toLowerCase() === normalizedEmail);

                    if (existing) {
                        if (existing.email_confirmed_at) {
                            throw new ConflictException('User is already registered and verified. Please log in.');
                        }
                        // Existing unverified account — update password/metadata and generate magiclink
                        const { data: updated, error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
                            existing.id,
                            { password, user_metadata: metadata || {} }
                        );
                        if (updateErr) {
                            throw new BadRequestException(updateErr.message);
                        }
                        user = updated.user;

                        const { data: reLinkData, error: reLinkErr } = await supabaseAdmin.auth.admin.generateLink({
                            type: 'magiclink',
                            email: normalizedEmail,
                            options: { redirectTo: callbackUrl },
                        });

                        if (reLinkErr || !reLinkData?.properties?.action_link) {
                            throw new BadRequestException(reLinkErr?.message || 'Failed to generate verification link.');
                        }

                        const actionLink = reLinkData.properties.action_link;
                        const emailSent = await this.mailService.sendVerificationEmail(normalizedEmail, actionLink);

                        return {
                            success: true,
                            emailSent,
                            message: emailSent
                                ? 'Verification email sent. Check your inbox.'
                                : 'Account exists. Please check your inbox or click Resend Verification.',
                            user: { id: user.id, email: user.email },
                        };
                    } else {
                        throw new ConflictException('User is already registered. Please log in.');
                    }
                } else {
                    throw new BadRequestException(linkErr.message || 'Failed to create user account.');
                }
            }

            if (!linkData?.properties?.action_link) {
                throw new BadRequestException('Failed to generate verification link.');
            }

            user = linkData.user;
            const actionLink = linkData.properties.action_link;

            // Deliver email via Zoho Mail immediately after account creation (~1 second)
            const emailSent = await this.mailService.sendVerificationEmail(normalizedEmail, actionLink);

            return {
                success: true,
                emailSent,
                message: emailSent
                    ? 'Verification email sent. Check your inbox.'
                    : 'Account created successfully! Verification email delivery is in progress. Please check your inbox.',
                user: {
                    id: user?.id,
                    email: user?.email,
                },
            };
        } catch (err) {
            this.logger.error('Registration process error:', err?.message || err);
            if (err instanceof ConflictException || err instanceof BadRequestException) {
                throw err;
            }
            throw new BadRequestException(err?.message || 'Failed to complete registration.');
        }
    }

    async resendVerification(resendDto: ResendVerificationDto) {
        const { email, redirectTo } = resendDto;
        const normalizedEmail = email.trim().toLowerCase();

        const defaultFrontend = process.env.FRONTEND_URL || 'http://localhost:5173';
        let callbackUrl = (redirectTo || defaultFrontend).trim();
        if (!callbackUrl.includes('/auth/callback')) {
            callbackUrl = `${callbackUrl.replace(/\/$/, '')}/auth/callback`;
        }

        const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
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

        const emailSent = await this.mailService.sendVerificationEmail(normalizedEmail, actionLink);

        return {
            success: true,
            emailSent,
            message: emailSent
                ? 'Verification email sent! Check your inbox.'
                : 'Verification email trigger attempted. Please check your inbox.',
        };
    }

    async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
        const { email, redirectTo } = forgotPasswordDto as any;
        const normalizedEmail = email.trim().toLowerCase();

        const defaultFrontend = process.env.FRONTEND_URL || 'http://localhost:5173';
        let callbackUrl = (redirectTo || defaultFrontend).trim();
        if (!callbackUrl.includes('/create-new-password')) {
            callbackUrl = `${callbackUrl.replace(/\/$/, '')}/create-new-password`;
        }

        const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        if (listErr) {
            throw new BadRequestException(listErr.message);
        }

        const existing = ((listData?.users || []) as any[]).find((u: any) => u.email?.toLowerCase() === normalizedEmail);
        if (!existing) {
            throw new BadRequestException('No registered account found with this email address.');
        }

        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email: normalizedEmail,
            options: { redirectTo: callbackUrl },
        });

        if (linkErr || !linkData?.properties?.action_link) {
            throw new BadRequestException(linkErr?.message || 'Failed to generate password reset link.');
        }

        const actionLink = linkData.properties.action_link;

        const emailSent = await this.mailService.sendPasswordResetEmail(normalizedEmail, actionLink);

        return {
            success: true,
            emailSent,
            message: emailSent
                ? 'Password reset link sent! Check your inbox.'
                : 'Password reset email trigger attempted. Please check your inbox.',
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
