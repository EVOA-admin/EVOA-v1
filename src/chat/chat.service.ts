import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Or } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { MessageRequest, MessageRequestStatus } from './entities/message-request.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { UserConnection } from '../users/entities/user-connection.entity';
import { Notification, NotificationType } from '../notifications/entities/notification.entity';
import { assertInvestorPaymentAccess } from '../users/user-access.util';

@Injectable()
export class ChatService {
    constructor(
        @InjectRepository(Conversation)
        private readonly conversationRepo: Repository<Conversation>,
        @InjectRepository(Message)
        private readonly messageRepo: Repository<Message>,
        @InjectRepository(MessageRequest)
        private readonly requestRepo: Repository<MessageRequest>,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        @InjectRepository(UserConnection)
        private readonly connectionRepo: Repository<UserConnection>,
        @InjectRepository(Notification)
        private readonly notificationRepo: Repository<Notification>,
    ) { }

    // ─── Permission Matrix ────────────────────────────────────────────────────
    /**
     * Returns true if sender can message receiver directly.
     * Rules:
     *   - Investor/Incubator → Startup          : ✅ always
     *   - Investor/Incubator → Investor/Incubator : ✅ mutual follow
     *   - Startup            → anyone            : ❌ (must send request)
     *   - Viewer             → anyone            : ✅ only mutual follow
     */
    private async canMessageDirectly(sender: User, receiver: User): Promise<boolean> {
        const sRole = sender.role;
        const rRole = receiver.role;

        // Investor/Incubator → Anyone: always allowed
        if (sRole === UserRole.INVESTOR || sRole === UserRole.INCUBATOR) {
            return true;
        }

        // For all other combinations:
        // - Investor/Incubator → Investor/Incubator
        // - Startup → anyone
        // - Viewer → anyone
        // Mutual follow is required
        return this.mutuallyFollow(sender.id, receiver.id);
    }

    private async mutuallyFollow(aId: string, bId: string): Promise<boolean> {
        const [aFollowsB, bFollowsA] = await Promise.all([
            this.connectionRepo.findOne({ where: { connectorId: aId, targetId: bId } }),
            this.connectionRepo.findOne({ where: { connectorId: bId, targetId: aId } }),
        ]);
        return !!(aFollowsB && bFollowsA);
    }

    /** Find or create a conversation between two users */
    private async findOrCreateConversation(user1Id: string, user2Id: string): Promise<Conversation> {
        // Canonical order so (A,B) and (B,A) resolve to the same row
        const [lo, hi] = [user1Id, user2Id].sort();

        let conv = await this.conversationRepo.findOne({
            where: { user1Id: lo, user2Id: hi },
        });
        if (!conv) {
            conv = await this.conversationRepo.save(
                this.conversationRepo.create({ user1Id: lo, user2Id: hi }),
            );
        }
        return conv;
    }

    // ─── Profile & Permission Helpers ─────────────────────────────────────────
    async getPermission(senderId: string, receiverId: string) {
        if (senderId === receiverId) return { canMessage: false, reason: 'Cannot message yourself', requiresFollow: false };

        const [sender, receiver] = await Promise.all([
            this.userRepo.findOne({ where: { id: senderId } }),
            this.userRepo.findOne({ where: { id: receiverId } }),
        ]);

        if (!sender || !receiver) throw new NotFoundException('User not found');
        assertInvestorPaymentAccess(sender);

        const canMessage = await this.canMessageDirectly(sender, receiver);
        if (canMessage) {
            return { canMessage: true, reason: null, requiresFollow: false };
        }

        // Check if there is an existing conversation already created (which implies a direct message was previously sent and allowed)
        // If receiver had previously received a message from sender (e.g. Investor -> Viewer), they can reply but it's good UX to suggest follow.
        const [aFollowsB, existingConv] = await Promise.all([
            this.connectionRepo.findOne({ where: { connectorId: senderId, targetId: receiverId } }),
            this.findOrCreateConversation(senderId, receiverId).catch(() => null)
        ]);

        const messageCount = existingConv ? await this.messageRepo.count({ where: { conversationId: existingConv.id } }) : 0;

        // If they don't follow but they already have a chat history, we let them chat but we can trigger the UI to show the follow button
        if (!canMessage && messageCount > 0) {
            return {
                canMessage: true,
                reason: null,
                requiresFollow: !aFollowsB
            };
        }

        // If completely not allowed, it is because they need mutual follow
        return {
            canMessage: false,
            reason: 'You must follow this user to send a message.',
            requiresFollow: true
        };
    }

    async getConversationWith(user1Id: string, user2Id: string) {
        if (user1Id === user2Id) throw new BadRequestException('Cannot message yourself');
        const conv = await this.findOrCreateConversation(user1Id, user2Id);
        return conv;
    }

    // ─── Send Message ─────────────────────────────────────────────────────────
    async sendMessage(senderId: string, receiverId: string, content: string) {
        if (senderId === receiverId) throw new BadRequestException('Cannot message yourself');

        const [sender, receiver] = await Promise.all([
            this.userRepo.findOne({ where: { id: senderId } }),
            this.userRepo.findOne({ where: { id: receiverId } }),
        ]);
        if (!sender || !receiver) throw new NotFoundException('User not found');
        assertInvestorPaymentAccess(sender);

        let allowed = await this.canMessageDirectly(sender, receiver);
        const conv = await this.findOrCreateConversation(senderId, receiverId);

        if (!allowed) {
            const messageCount = await this.messageRepo.count({ where: { conversationId: conv.id } });
            if (messageCount > 0) {
                allowed = true;
            }
        }

        if (!allowed) {
            throw new ForbiddenException('This user does not accept messages yet.');
        }
        const msg = await this.messageRepo.save(
            this.messageRepo.create({ conversationId: conv.id, senderId, content }),
        );

        // Update last message timestamp
        await this.conversationRepo.update(conv.id, { lastMessageAt: new Date() });

        // Send notification to receiver
        await this.notificationRepo.save(
            this.notificationRepo.create({
                userId: receiverId,
                type: NotificationType.SYSTEM,
                title: 'New Message 💬',
                message: `${sender.fullName || 'Someone'} sent you a message.`,
                link: `/inbox/${conv.id}`,
            }),
        ).catch(() => { /* ignore */ });

        return msg;
    }

    // ─── Get Conversations ────────────────────────────────────────────────────
    async getConversations(userId: string) {
        const convs = await this.conversationRepo.find({
            where: [{ user1Id: userId }, { user2Id: userId }],
            relations: ['user1', 'user2'],
            order: { lastMessageAt: 'DESC' },
        });

        // Attach last message and unread count to each
        const enriched = await Promise.all(
            convs.map(async (c) => {
                const other = c.user1Id === userId ? c.user2 : c.user1;
                const [lastMsg, unread] = await Promise.all([
                    this.messageRepo.findOne({
                        where: { conversationId: c.id },
                        order: { createdAt: 'DESC' },
                    }),
                    other?.id
                        ? this.messageRepo.count({
                              where: { conversationId: c.id, senderId: other.id, isRead: false },
                          })
                        : 0,
                ]);
                return { ...c, lastMessage: lastMsg, unreadCount: unread, otherUser: other };
            }),
        );

        return enriched;
    }

    // ─── Get Messages ─────────────────────────────────────────────────────────
    async getMessages(conversationId: string, userId: string) {
        const conv = await this.conversationRepo.findOne({ where: { id: conversationId } });
        if (!conv) throw new NotFoundException('Conversation not found');
        if (conv.user1Id !== userId && conv.user2Id !== userId) {
            throw new ForbiddenException('Access denied');
        }

        // Mark messages from the other person as read
        const otherUserId = conv.user1Id === userId ? conv.user2Id : conv.user1Id;
        await this.messageRepo.update(
            { conversationId, senderId: otherUserId, isRead: false },
            { isRead: true },
        );

        return this.messageRepo.find({
            where: { conversationId },
            order: { createdAt: 'ASC' },
        });
    }

    // ─── Send Message Request ─────────────────────────────────────────────────
    async sendRequest(fromUserId: string, toUserId: string, message: string) {
        if (fromUserId === toUserId) throw new BadRequestException('Cannot request yourself');

        const [from, to] = await Promise.all([
            this.userRepo.findOne({ where: { id: fromUserId } }),
            this.userRepo.findOne({ where: { id: toUserId } }),
        ]);
        if (!from || !to) throw new NotFoundException('User not found');
        assertInvestorPaymentAccess(from);

        const canDirect = await this.canMessageDirectly(from, to);
        if (canDirect) {
            throw new BadRequestException('You can message this user directly.');
        }

        // Create request (or update existing pending one)
        let req = await this.requestRepo.findOne({
            where: { fromUserId, toUserId, status: MessageRequestStatus.PENDING },
        });
        if (!req) {
            req = await this.requestRepo.save(
                this.requestRepo.create({ fromUserId, toUserId, message }),
            );
        }

        // Notify the receiver
        await this.notificationRepo.save(
            this.notificationRepo.create({
                userId: toUserId,
                type: NotificationType.SYSTEM,
                title: 'Message Request 📨',
                message: `${from.fullName || 'Someone'} tried to message you.`,
                link: `/inbox/requests`,
            }),
        ).catch(() => { /* ignore */ });

        return { message: 'Message request sent.', requestId: req.id };
    }

    // ─── Get Incoming Requests ────────────────────────────────────────────────
    async getRequests(userId: string) {
        return this.requestRepo.find({
            where: { toUserId: userId, status: MessageRequestStatus.PENDING },
            relations: ['fromUser'],
            order: { createdAt: 'DESC' },
        });
    }

    // ─── Respond to a Request ─────────────────────────────────────────────────
    async respondToRequest(requestId: string, userId: string, action: 'accept' | 'ignore') {
        const req = await this.requestRepo.findOne({
            where: { id: requestId, toUserId: userId },
            relations: ['fromUser'],
        });
        if (!req) throw new NotFoundException('Request not found');

        if (action === 'accept') {
            req.status = MessageRequestStatus.ACCEPTED;
            await this.requestRepo.save(req);
            // Auto-open conversation so they can now chat
            await this.findOrCreateConversation(req.fromUserId, userId);
            return { message: 'Request accepted. Chat is now unlocked.' };
        }

        req.status = MessageRequestStatus.IGNORED;
        await this.requestRepo.save(req);
        return { message: 'Request ignored.' };
    }

    // ─── Unread Count ─────────────────────────────────────────────────────────
    async getUnreadCount(userId: string) {
        const convIds = await this.conversationRepo.find({
            where: [{ user1Id: userId }, { user2Id: userId }],
            select: ['id'],
        });
        const ids = convIds.map(c => c.id);

        let unreadMessages = 0;
        if (ids.length > 0) {
            unreadMessages = await this.messageRepo
                .createQueryBuilder('m')
                .where('m.conversationId IN (:...ids)', { ids })
                .andWhere('m.senderId != :userId', { userId })
                .andWhere('m.isRead = false')
                .getCount();
        }

        const pendingRequests = await this.requestRepo.count({
            where: { toUserId: userId, status: MessageRequestStatus.PENDING },
        });

        return { unreadMessages, pendingRequests, total: unreadMessages + pendingRequests };
    }
}
