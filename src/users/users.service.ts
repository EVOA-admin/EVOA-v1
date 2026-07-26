import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { UserConnection } from './entities/user-connection.entity';
import { Notification, NotificationType } from '../notifications/entities/notification.entity';
import { UpdateProfileDto } from './dto/users.dto';
import { supabaseAdmin } from '../config/supabase.config';
import { Investor } from '../investors/entities/investor.entity';
import { isAdminEmail } from './admin-identity.util';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(Notification)
        private readonly notificationRepository: Repository<Notification>,
        @InjectRepository(UserConnection)
        private readonly connectionRepository: Repository<UserConnection>,
        @InjectRepository(Investor)
        private readonly investorRepository: Repository<Investor>,
    ) { }

    async getProfile(userId: string) {
        return this.userRepository.findOne({
            where: { id: userId },
            relations: ['startups'],
        });
    }

    async getPublicProfile(userId: string) {
        const user = await this.userRepository.findOne({
            where: { id: userId },
            relations: [
                'startups',
                'startups.reels',
                'investors',
                'incubators',
            ],
        });
        if (!user) throw new Error('User not found');
        return user;
    }

    async updateProfile(userId: string, dto: UpdateProfileDto) {
        const updatePayload: Partial<User> = {};
        if (dto.fullName !== undefined) updatePayload.fullName = dto.fullName;
        if (dto.bio !== undefined) updatePayload.bio = dto.bio;
        if (dto.company !== undefined) updatePayload.company = dto.company;
        if (dto.location !== undefined) updatePayload.location = dto.location;
        if (dto.website !== undefined) updatePayload.website = dto.website;
        if (dto.avatarUrl !== undefined) updatePayload.avatarUrl = dto.avatarUrl;

        if (Object.keys(updatePayload).length === 0) {
            return this.userRepository.findOne({ where: { id: userId } });
        }

        try {
            await this.userRepository.update({ id: userId }, updatePayload);
        } catch (err) {
            console.error('[UsersService] updateProfile DB error:', err?.message || err);
            throw err;
        }
        return this.userRepository.findOne({ where: { id: userId } });
    }

    async updateRole(userId: string, role: string) {
        const validRoles = Object.values(UserRole);
        if (!validRoles.includes(role as UserRole)) {
            throw new BadRequestException(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
        }

        const isViewer = role === UserRole.VIEWER;
        await this.userRepository.update(
            { id: userId },
            {
                role: role as UserRole,
                roleSelected: true,
                registrationCompleted: isViewer,
            }
        );
        return this.userRepository.findOne({ where: { id: userId } });
    }

    async completeRegistration(userId: string) {
        await this.userRepository.update({ id: userId }, { registrationCompleted: true });
        return this.userRepository.findOne({ where: { id: userId } });
    }

    /** Check whether connectorId follows targetId */
    async getConnectionStatus(targetUserId: string, connectorId: string) {
        if (targetUserId === connectorId) {
            return { connected: false, isFollowing: false, followerCount: 0, isOwnProfile: true };
        }

        const [connection, target] = await Promise.all([
            this.connectionRepository.findOne({
                where: { connectorId, targetId: targetUserId }
            }),
            this.userRepository.findOne({
                where: { id: targetUserId },
                select: ['id', 'connectionCount', 'role'],
            }),
        ]);

        const isFollowing = !!connection;
        return {
            connected: isFollowing,
            isFollowing,
            followerCount: target?.connectionCount ?? 0,
        };
    }

    /** Alias for getConnectionStatus */
    async getFollowStatus(targetUserId: string, followerId: string) {
        return this.getConnectionStatus(targetUserId, followerId);
    }

    /**
     * Toggle follow / unfollow.
     * Startups cannot be followed — they receive "Support" via /startups/:id/follow.
     */
    async toggleConnect(targetUserId: string, connectorId: string) {
        if (targetUserId === connectorId) {
            return { message: 'Cannot follow yourself', connected: false, isFollowing: false, followerCount: 0 };
        }

        const [target, connector] = await Promise.all([
            this.userRepository.findOne({
                where: { id: targetUserId },
                select: ['id', 'role', 'fullName', 'connectionCount'],
            }),
            this.userRepository.findOne({
                where: { id: connectorId },
                select: ['id', 'fullName', 'avatarUrl'],
            }),
        ]);

        if (!target || !connector) {
            throw new BadRequestException('User not found');
        }

        // Startups receive Support, not Follow
        if (target.role === UserRole.STARTUP) {
            throw new BadRequestException('Startups cannot be followed. Use the Support feature instead.');
        }

        const existing = await this.connectionRepository.findOne({
            where: { connectorId, targetId: targetUserId },
        });

        if (existing) {
            // — Unfollow —
            await this.connectionRepository.remove(existing);
            const newCount = Math.max(0, (target.connectionCount || 0) - 1);
            await this.userRepository.update({ id: targetUserId }, { connectionCount: newCount });
            return { connected: false, isFollowing: false, followerCount: newCount };
        }

        // — Follow —
        await this.connectionRepository.save({
            connectorId,
            targetId: targetUserId,
            connector: { id: connectorId } as any,
            target: { id: targetUserId } as any,
        });

        const newCount = (target.connectionCount || 0) + 1;
        await this.userRepository.update({ id: targetUserId }, { connectionCount: newCount });

        // Send "started following you" notification
        await this.notificationRepository.save(
            this.notificationRepository.create({
                userId: target.id,
                type: NotificationType.SYSTEM,
                title: 'New Follower 👋',
                message: `${connector.fullName || 'Someone'} started following you!`,
                link: `/u/${connector.id}`,
                actorId: connector.id,
            }),
        ).catch(() => { /* ignore */ });

        return { connected: true, isFollowing: true, followerCount: newCount };
    }

    /** Alias for toggleConnect */
    async toggleFollow(targetUserId: string, followerId: string) {
        return this.toggleConnect(targetUserId, followerId);
    }

    /** List of users who follow the given user */
    async getFollowers(userId: string) {
        const connections = await this.connectionRepository.find({
            where: { targetId: userId },
            relations: ['connector'],
            order: { createdAt: 'DESC' },
        });
        return connections.map(c => ({
            id: c.connector?.id,
            fullName: c.connector?.fullName,
            avatarUrl: c.connector?.avatarUrl,
            role: c.connector?.role,
        }));
    }

    /** List of users that userId is following */
    async getFollowing(userId: string) {
        const connections = await this.connectionRepository.find({
            where: { connectorId: userId },
            relations: ['target'],
            order: { createdAt: 'DESC' },
        });
        return connections.map(c => ({
            id: c.target?.id,
            fullName: c.target?.fullName,
            avatarUrl: c.target?.avatarUrl,
            role: c.target?.role,
        }));
    }

    /** @deprecated — kept for backward compat */
    async trackConnectClick(targetUserId: string, clickerId: string) {
        return this.toggleConnect(targetUserId, clickerId);
    }

    async syncUser(dto: any) {
        const { email, id, user_metadata } = dto;
        const shouldForceAdmin = isAdminEmail(email);

        let user = await this.userRepository.findOne({ where: { supabaseUserId: id } });

        if (!user) {
            // Fallback: look up by email and link the supabaseUserId
            user = await this.userRepository.findOne({ where: { email } });
            if (user) {
                user.supabaseUserId = id;
                await this.userRepository.save(user);
            }
        }

        if (!user) {
            // Brand new user — create with defaults
            const fullName = user_metadata?.full_name || user_metadata?.name || user_metadata?.fullName || email?.split('@')[0] || 'User';
            const avatarUrl = user_metadata?.avatar_url || user_metadata?.picture || '';
            user = this.userRepository.create({
                email,
                supabaseUserId: id,
                fullName,
                avatarUrl,
                role: shouldForceAdmin ? UserRole.ADMIN : UserRole.VIEWER,
                roleSelected: shouldForceAdmin,
                registrationCompleted: shouldForceAdmin,
                isActive: true,
            });
            await this.userRepository.save(user);
        } else {
            // Existing user: if fullName is missing or generic "User", auto-heal from user_metadata / email
            let needsSave = false;
            const healedName = user_metadata?.full_name || user_metadata?.name || user_metadata?.fullName || email?.split('@')[0];
            if ((!user.fullName || user.fullName === 'User') && healedName) {
                user.fullName = healedName;
                needsSave = true;
            }
            const healedAvatar = user_metadata?.avatar_url || user_metadata?.picture;
            if (!user.avatarUrl && healedAvatar) {
                user.avatarUrl = healedAvatar;
                needsSave = true;
            }

            if (user.role && (user.roleSelected === null || user.roleSelected === undefined)) {
                (user as any).roleSelected = true;
                needsSave = true;
            }
            if (user.role && (user.registrationCompleted === null || user.registrationCompleted === undefined)) {
                (user as any).registrationCompleted = true;
                needsSave = true;
            }

            if (
                user.role === UserRole.INVESTOR &&
                !user.isPremium &&
                !user.isPaymentPending &&
                !user.isLegacyUser
            ) {
                const existingInvestorProfile = await this.investorRepository.findOne({
                    where: { userId: user.id },
                    select: ['id'],
                });

                if (existingInvestorProfile) {
                    user.isLegacyUser = true;
                    needsSave = true;
                }
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
                needsSave = true;
            }

            if (needsSave) {
                await this.userRepository.save(user);
            }
        }

        // Re-fetch to ensure we return a clean, fully populated record
        const freshUser = await this.userRepository.findOne({ where: { id: user.id } });
        return freshUser;
    }

    /**
     * Permanently delete the current user's account.
     *
     * Order of operations:
     * 1.  Remove the user row from the DB  → all child rows cascade automatically
     *     (posts, reels, likes, comments, saves, views, follows, notifications,
     *      chat conversations/messages, connections).
     * 2.  Delete the Supabase auth identity so the user can never log back in.
     *
     * The `supabaseUserId` is saved before deletion so we can still call
     * `auth.admin.deleteUser` even after the DB row is gone.
     */
    async deleteAccount(userId: string): Promise<{ message: string }> {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');

        const supabaseUserId = user.supabaseUserId;

        // 1. Delete the DB row — cascades to all related tables
        await this.userRepository.delete({ id: userId });

        // 2. Remove the Supabase auth account (fire-and-forget; don't block on error)
        if (supabaseUserId) {
            try {
                const { error } = await supabaseAdmin.auth.admin.deleteUser(supabaseUserId);
                if (error) {
                    console.error('[UsersService] supabase auth.admin.deleteUser error:', error.message);
                }
            } catch (err) {
                console.error('[UsersService] Failed to delete Supabase auth user:', err);
            }
        }

        return { message: 'Account deleted successfully' };
    }
}
