import { User, UserRole } from './entities/user.entity';

const DEFAULT_ADMIN_EMAILS = ['admin@evoa.co.in'];

const normalizeEmail = (email: string | null | undefined) => (email || '').trim().toLowerCase();

export const getAdminEmails = () => {
    const configured = (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map((email) => normalizeEmail(email))
        .filter(Boolean);

    return [...new Set([...DEFAULT_ADMIN_EMAILS, ...configured])];
};

export const isAdminEmail = (email: string | null | undefined) => {
    const normalized = normalizeEmail(email);
    if (!normalized) return false;
    return getAdminEmails().includes(normalized);
};

export const isAdminIdentity = (user: Pick<User, 'role' | 'email'> | null | undefined) => {
    if (!user) return false;
    return user.role === UserRole.ADMIN || isAdminEmail(user.email);
};

export const isSuperAdminIdentity = (req: any) => {
    if (!req) return false;
    const adminRole = req.admin?.role || req.user?.adminRole;
    if (adminRole === 'SUPER_ADMIN') return true;
    const email = (req.admin?.email || req.user?.email || '').trim().toLowerCase();
    if (isAdminEmail(email)) return true;
    if (req.user?.role === UserRole.ADMIN && adminRole !== 'EVENT_ADMIN') return true;
    return false;
};
