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

    private readonly logger = new Logger(AuthService.name);

    async register(registerDto: RegisterDto) {
        const { email, password, metadata, redirectTo } = registerDto;
        const normalizedEmail = email.trim().toLowerCase();

        const defaultFrontend = (process.env.FRONTEND_URL || 'https://evoa.co.in').trim().replace(/^["']|["']$/g, '');
        let callbackUrl = (redirectTo || defaultFrontend).trim();
        if (!callbackUrl.includes('/auth/callback')) {
            callbackUrl = `${callbackUrl.replace(/\/$/, '')}/auth/callback`;
        }

        let user: any = null;
        let isExistingUnconfirmed = false;

        // Step 1: Attempt to create user directly in Supabase
        const { data: createData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email: normalizedEmail,
            password,
            user_metadata: metadata || {},
            email_confirm: false,
        });

        if (createErr) {
            const isEmailExists = createErr.message?.toLowerCase().includes('already') || (createErr as any).code === 'email_exists' || (createErr as any).status === 422;
            if (isEmailExists) {
                // Check if user is unverified by attempting to generate magiclink / verification link
                const { data: linkCheck, error: linkCheckErr } = await supabaseAdmin.auth.admin.generateLink({
                    type: 'magiclink',
                    email: normalizedEmail,
                    options: { redirectTo: callbackUrl },
                });

                if (linkCheckErr) {
                    throw new ConflictException('User with this email already exists and is registered. Please log in.');
                }

                if (linkCheck?.user?.email_confirmed_at) {
                    throw new ConflictException('User is already registered and verified. Please log in.');
                }

                user = linkCheck?.user;
                isExistingUnconfirmed = true;

                // Update password and metadata for unconfirmed user
                if (user?.id) {
                    await supabaseAdmin.auth.admin.updateUserById(user.id, {
                        password,
                        user_metadata: metadata || {},
                    });
                }
            } else {
                throw new BadRequestException(createErr.message || 'Failed to create user account.');
            }
        } else {
            user = createData?.user;
        }

        if (!user) {
            throw new BadRequestException('Failed to initialize user record.');
        }

        // Step 2: Generate action verification link
        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
            type: isExistingUnconfirmed ? 'magiclink' : 'signup',
            email: normalizedEmail,
            password,
            options: { redirectTo: callbackUrl },
        });

        if (linkErr || !linkData?.properties?.action_link) {
            throw new BadRequestException(linkErr?.message || 'Failed to generate verification link.');
        }

        const actionLink = linkData.properties.action_link;

        // Step 3: Trigger live email delivery immediately in background (does not block HTTP response)
        this.mailService.sendVerificationEmail(normalizedEmail, actionLink)
            .then(() => {
                this.logger.log(`[AuthService] Verification email successfully delivered to ${normalizedEmail}`);
            })
            .catch((err) => {
                this.logger.error(`[AuthService] Verification email failed for ${normalizedEmail}: ${err?.message || err}`);
            });

        // Step 4: Return instant 200 OK (~0-1 second response time)
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

        const defaultFrontend = (process.env.FRONTEND_URL || 'https://evoa.co.in').trim().replace(/^["']|["']$/g, '');
        let callbackUrl = (redirectTo || defaultFrontend).trim();
        if (!callbackUrl.includes('/auth/callback')) {
            callbackUrl = `${callbackUrl.replace(/\/$/, '')}/auth/callback`;
        }

        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: normalizedEmail,
            options: { redirectTo: callbackUrl },
        });

        if (linkErr || !linkData?.properties?.action_link) {
            if (linkErr?.message?.toLowerCase().includes('not found') || (linkErr as any)?.code === 'user_not_found') {
                throw new BadRequestException('No account found with this email address.');
            }
            throw new BadRequestException(linkErr?.message || 'Failed to generate verification link.');
        }

        if (linkData?.user?.email_confirmed_at) {
            return {
                success: true,
                message: 'Your account is already verified. You can log in directly.',
            };
        }

        const actionLink = linkData.properties.action_link;

        this.mailService.sendVerificationEmail(normalizedEmail, actionLink)
            .then(() => {
                this.logger.log(`[AuthService] Resent verification email to ${normalizedEmail}`);
            })
            .catch((err) => {
                this.logger.error(`[AuthService] Resend verification email failed for ${normalizedEmail}: ${err?.message || err}`);
            });

        return {
            success: true,
            message: 'Verification email sent! Check your inbox.',
        };
    }

    async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
        const { email, redirectTo } = forgotPasswordDto as any;
        const normalizedEmail = email.trim().toLowerCase();

        const defaultFrontend = (process.env.FRONTEND_URL || 'https://evoa.co.in').trim().replace(/^["']|["']$/g, '');
        let callbackUrl = (redirectTo || defaultFrontend).trim();
        if (!callbackUrl.includes('/create-new-password')) {
            callbackUrl = `${callbackUrl.replace(/\/$/, '')}/create-new-password`;
        }

        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email: normalizedEmail,
            options: { redirectTo: callbackUrl },
        });

        if (linkErr || !linkData?.properties?.action_link) {
            if (linkErr?.message?.toLowerCase().includes('not found') || (linkErr as any)?.code === 'user_not_found') {
                throw new BadRequestException('No registered account found with this email address.');
            }
            throw new BadRequestException(linkErr?.message || 'Failed to generate password reset link.');
        }

        let actionLink = linkData.properties.action_link;
        try {
            const url = new URL(actionLink);
            url.searchParams.set('redirect_to', callbackUrl);
            actionLink = url.toString();
        } catch (_) { /* ignore */ }

        this.mailService.sendPasswordResetEmail(normalizedEmail, actionLink)
            .then(() => {
                this.logger.log(`[AuthService] Password reset email sent to ${normalizedEmail}`);
            })
            .catch((err) => {
                this.logger.error(`[AuthService] Password reset email failed for ${normalizedEmail}: ${err?.message || err}`);
            });

        return {
            success: true,
            message: 'Password reset link sent! Check your inbox.',
        };
    }

    async testMailDelivery(email: string) {
        const targetEmail = (email || 'admin@evoa.co.in').trim().toLowerCase();
        return this.mailService.testDelivery(targetEmail);
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
