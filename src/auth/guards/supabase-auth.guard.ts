import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { getSupabaseAdmin } from '../../config/supabase.config';
import { User, UserRole } from '../../users/entities/user.entity';
import { isAdminEmail } from '../../users/admin-identity.util';
import { Admin } from '../../admin/entities/admin.entity';

// ──────────────────────────────────────────────────────────────────────────────
// In-memory JWT verification cache
//
// Problem solved: every API call previously triggered an external HTTPS round-
// trip to Supabase (~100-500 ms) to verify the JWT. On page load, 4 parallel
// requests fired simultaneously. With a DB pool of only 3 connections this
// caused pool exhaustion -> timeout errors -> feed returned empty -> "No Pitches Yet".
//
// Fix: cache the verified identity (supabaseUserId, email) keyed by raw token,
// respecting the token's own expiry. The DB user lookup still runs each request
// (cheap, local) so any role/status changes take effect immediately.
//
// Bounds: max 2000 entries; expired entries are evicted before each lookup.
// Never persisted across server restarts (in-memory only).
// ──────────────────────────────────────────────────────────────────────────────
interface CachedToken {
    supabaseUserId: string;
    email: string | undefined;
    expiresAt: number; // Unix ms - 90 s before JWT exp for safety margin
}

const TOKEN_CACHE = new Map<string, CachedToken>();
const TOKEN_CACHE_MAX = 2000;
const TOKEN_CACHE_SAFETY_MARGIN_MS = 90_000; // evict 90 s before actual expiry

function decodeJwtExp(token: string): number | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
        return typeof payload.exp === 'number' ? payload.exp * 1000 : null; // s -> ms
    } catch {
        return null;
    }
}

function evictExpiredTokens() {
    const now = Date.now();
    for (const [key, entry] of TOKEN_CACHE.entries()) {
        if (entry.expiresAt <= now) TOKEN_CACHE.delete(key);
    }
}

function getCachedToken(token: string): CachedToken | null {
    evictExpiredTokens();
    const entry = TOKEN_CACHE.get(token);
    if (!entry || entry.expiresAt <= Date.now()) {
        TOKEN_CACHE.delete(token);
        return null;
    }
    return entry;
}

function setCachedToken(token: string, data: Omit<CachedToken, 'expiresAt'>, jwtExpMs: number | null) {
    if (!jwtExpMs) return;
    const expiresAt = jwtExpMs - TOKEN_CACHE_SAFETY_MARGIN_MS;
    if (expiresAt <= Date.now()) return;

    if (TOKEN_CACHE.size >= TOKEN_CACHE_MAX) {
        evictExpiredTokens();
        if (TOKEN_CACHE.size >= TOKEN_CACHE_MAX) {
            // Still full - evict oldest half
            const toDelete = [...TOKEN_CACHE.keys()].slice(0, Math.floor(TOKEN_CACHE_MAX / 2));
            toDelete.forEach(k => TOKEN_CACHE.delete(k));
        }
    }

    TOKEN_CACHE.set(token, { ...data, expiresAt });
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(Admin)
        private readonly adminRepository: Repository<Admin>,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const token = this.extractTokenFromHeader(request);

        if (!token) {
            throw new UnauthorizedException('No authentication token provided');
        }

        // ── Step 0: Check if token is a custom Admin JWT token ──
        try {
            const secret = process.env.JWT_SECRET || 'EVOA_SECRET_SUPER_KEY_2026';
            const decoded = jwt.verify(token, secret) as any;
            if (decoded && (decoded.adminId || decoded.sub)) {
                const adminId = decoded.adminId || decoded.sub;
                const dbAdmin = await this.adminRepository.findOne({ where: { id: adminId } });
                if (dbAdmin) {
                    if (!dbAdmin.isActive) {
                        throw new UnauthorizedException('Admin account has been deactivated');
                    }
                    request.admin = dbAdmin;
                    request.user = {
                        id: dbAdmin.id,
                        email: dbAdmin.email,
                        fullName: dbAdmin.fullName,
                        companyName: dbAdmin.companyName,
                        role: UserRole.ADMIN,
                        adminRole: dbAdmin.role,
                        isActive: dbAdmin.isActive,
                    };
                    return true;
                }
            }
        } catch (err) {
            if (err instanceof UnauthorizedException) throw err;
            // Not a custom Admin JWT token, proceed to Supabase token verification
        }

        try {
            // ── Step 1: Verify JWT identity (cached after first verification) ──
            let supabaseUserId: string;
            let email: string | undefined;

            const cached = getCachedToken(token);
            if (cached) {
                // Cache hit - skip external Supabase round-trip
                supabaseUserId = cached.supabaseUserId;
                email = cached.email;
            } else {
                // Cache miss - verify with Supabase (external HTTP call)
                const adminClient = getSupabaseAdmin();
                const { data, error } = await adminClient.auth.getUser(token);

                if (error || !data.user) {
                    console.error('[SupabaseAuthGuard] Token verification failed:', {
                        supabaseError: error?.message,
                        supabaseStatus: (error as any)?.status,
                        tokenPrefix: token.substring(0, 20) + '...',
                    });
                    throw new UnauthorizedException('Invalid or expired token');
                }

                supabaseUserId = data.user.id;
                email = data.user.email;

                // Cache for future requests within this token's lifetime
                const jwtExpMs = decodeJwtExp(token);
                setCachedToken(token, { supabaseUserId, email }, jwtExpMs);
            }

            // ── Step 2: Find or link user in database (always runs - catches role/status changes) ──
            let user = await this.userRepository.findOne({ where: { supabaseUserId } });

            if (!user && email) {
                user = await this.userRepository.findOne({ where: { email } });
                if (user) {
                    user.supabaseUserId = supabaseUserId;
                    await this.userRepository.save(user);
                }
            }

            const shouldForceAdmin = isAdminEmail(email);

            if (!user) {
                user = this.userRepository.create({
                    email,
                    fullName: '',
                    supabaseUserId,
                    role: shouldForceAdmin ? UserRole.ADMIN : UserRole.VIEWER,
                    roleSelected: shouldForceAdmin,
                    registrationCompleted: shouldForceAdmin,
                    isActive: true,
                });
                await this.userRepository.save(user);
            }

            if (shouldForceAdmin && (
                user.role !== UserRole.ADMIN ||
                user.roleSelected !== true ||
                user.registrationCompleted !== true ||
                user.isActive === false
            )) {
                user.role = UserRole.ADMIN;
                user.roleSelected = true;
                user.registrationCompleted = true;
                user.isActive = true;
                await this.userRepository.save(user);
            }

            if (user.isActive === false) {
                throw new UnauthorizedException('This account has been deactivated.');
            }

            // Link Admin entity identity if available
            if (email) {
                const dbAdmin = await this.adminRepository.findOne({ where: { email: email.toLowerCase() } });
                if (dbAdmin) {
                    request.admin = dbAdmin;
                    (user as any).adminRole = dbAdmin.role;
                } else if (shouldForceAdmin) {
                    request.admin = {
                        id: user.id,
                        email: user.email,
                        fullName: user.fullName || 'EVOA Super Admin',
                        role: 'SUPER_ADMIN',
                        isActive: true,
                    };
                    (user as any).adminRole = 'SUPER_ADMIN';
                }
            }

            // Attach user to request
            request.user = user;
            request.supabaseUser = { id: supabaseUserId, email };

            return true;
        } catch (error) {
            if (error instanceof UnauthorizedException) {
                throw error;
            }
            console.error('[SupabaseAuthGuard] Unexpected error:', error?.message || error);
            throw new UnauthorizedException('Token validation failed');
        }
    }

    private extractTokenFromHeader(request: any): string | undefined {
        const [type, token] = request.headers.authorization?.split(' ') ?? [];
        return type === 'Bearer' ? token : undefined;
    }
}
