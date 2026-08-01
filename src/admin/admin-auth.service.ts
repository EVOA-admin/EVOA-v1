import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { Admin, AdminRole } from './entities/admin.entity';
import {
  AdminLoginDto,
  CreateEventAdminDto,
  UpdateEventAdminDto,
  ResetAdminPasswordDto,
} from './dto/admin-auth.dto';

const DEFAULT_SUPER_ADMIN_EMAIL = 'admin@evoa.co.in';
const DEFAULT_SUPER_ADMIN_PASSWORD = 'Password123!';
const JWT_SECRET = process.env.JWT_SECRET || 'EVOA_SECRET_SUPER_KEY_2026';

@Injectable()
export class AdminAuthService implements OnModuleInit {
  constructor(
    @InjectRepository(Admin)
    private readonly adminRepository: Repository<Admin>,
  ) {}

  async onModuleInit() {
    await this.seedSuperAdmin();
  }

  /**
   * Seed/Migrate hardcoded Super Admin into database
   */
  async seedSuperAdmin(): Promise<Admin> {
    try {
      let superAdmin = await this.adminRepository.findOne({
        where: { email: DEFAULT_SUPER_ADMIN_EMAIL.toLowerCase() },
      });

      if (!superAdmin) {
        const passwordHash = await bcrypt.hash(DEFAULT_SUPER_ADMIN_PASSWORD, 10);
        superAdmin = this.adminRepository.create({
          fullName: 'EVOA Super Admin',
          companyName: 'EVOA Platform',
          email: DEFAULT_SUPER_ADMIN_EMAIL.toLowerCase(),
          passwordHash,
          role: AdminRole.SUPER_ADMIN,
          isActive: true,
        });
        await this.adminRepository.save(superAdmin);
        console.log('[AdminAuthService] Successfully seeded Super Admin:', DEFAULT_SUPER_ADMIN_EMAIL);
      }
      return superAdmin;
    } catch (err) {
      console.error('[AdminAuthService] Super Admin seed error:', err?.message || err);
      throw err;
    }
  }

  /**
   * Authenticate Admin by Email & Password
   */
  async login(dto: AdminLoginDto) {
    const emailNormalized = dto.email.trim().toLowerCase();
    let admin = await this.adminRepository.findOne({
      where: { email: emailNormalized },
    });

    // Auto-seed fallback if super admin email matches but table was empty
    if (!admin && emailNormalized === DEFAULT_SUPER_ADMIN_EMAIL.toLowerCase()) {
      admin = await this.seedSuperAdmin();
    }

    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!admin.isActive) {
      throw new ForbiddenException('Account is disabled');
    }

    const payload = {
      sub: admin.id,
      adminId: admin.id,
      email: admin.email,
      fullName: admin.fullName,
      role: admin.role,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    return {
      token,
      admin: {
        id: admin.id,
        fullName: admin.fullName,
        companyName: admin.companyName,
        email: admin.email,
        role: admin.role,
        isActive: admin.isActive,
      },
    };
  }

  /**
   * Get Current Admin Profile
   */
  async getProfile(adminId: string) {
    const admin = await this.adminRepository.findOne({ where: { id: adminId } });
    if (!admin) {
      throw new NotFoundException('Admin profile not found');
    }
    return {
      id: admin.id,
      fullName: admin.fullName,
      companyName: admin.companyName,
      email: admin.email,
      role: admin.role,
      isActive: admin.isActive,
    };
  }

  /**
   * List all Event Admins (Super Admin only)
   */
  async getEventAdmins() {
    const admins = await this.adminRepository.find({
      where: { role: AdminRole.EVENT_ADMIN },
      order: { createdAt: 'DESC' },
    });
    return admins.map((a) => ({
      id: a.id,
      fullName: a.fullName,
      companyName: a.companyName,
      email: a.email,
      role: a.role,
      isActive: a.isActive,
      createdAt: a.createdAt,
    }));
  }

  /**
   * Create Event Admin (Super Admin only)
   */
  async createEventAdmin(dto: CreateEventAdminDto) {
    const emailNormalized = dto.email.trim().toLowerCase();
    const existing = await this.adminRepository.findOne({
      where: { email: emailNormalized },
    });

    if (existing) {
      throw new ConflictException('An admin with this email address already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const eventAdmin = this.adminRepository.create({
      fullName: dto.fullName.trim(),
      companyName: dto.companyName ? dto.companyName.trim() : undefined,
      email: emailNormalized,
      passwordHash,
      role: AdminRole.EVENT_ADMIN,
      isActive: dto.isActive !== false,
    });

    const saved = await this.adminRepository.save(eventAdmin);
    return {
      id: saved.id,
      fullName: saved.fullName,
      companyName: saved.companyName,
      email: saved.email,
      role: saved.role,
      isActive: saved.isActive,
      createdAt: saved.createdAt,
    };
  }

  /**
   * Update Event Admin (Super Admin only)
   */
  async updateEventAdmin(adminId: string, dto: UpdateEventAdminDto) {
    const admin = await this.adminRepository.findOne({ where: { id: adminId } });
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    if (admin.role === AdminRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot edit Super Admin account via Management API');
    }

    if (dto.fullName !== undefined) admin.fullName = dto.fullName.trim();
    if (dto.companyName !== undefined) admin.companyName = dto.companyName.trim();
    if (dto.email !== undefined && dto.email.trim().toLowerCase() !== admin.email) {
      const emailNormalized = dto.email.trim().toLowerCase();
      const existing = await this.adminRepository.findOne({ where: { email: emailNormalized } });
      if (existing && existing.id !== adminId) {
        throw new ConflictException('Email already in use by another admin');
      }
      admin.email = emailNormalized;
    }
    if (dto.isActive !== undefined) admin.isActive = dto.isActive;

    const saved = await this.adminRepository.save(admin);
    return {
      id: saved.id,
      fullName: saved.fullName,
      companyName: saved.companyName,
      email: saved.email,
      role: saved.role,
      isActive: saved.isActive,
    };
  }

  /**
   * Reset Admin Password (Super Admin only)
   */
  async resetAdminPassword(adminId: string, dto: ResetAdminPasswordDto) {
    const admin = await this.adminRepository.findOne({ where: { id: adminId } });
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    if (admin.role === AdminRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot reset Super Admin password via Management API');
    }

    admin.passwordHash = await bcrypt.hash(dto.password, 10);
    await this.adminRepository.save(admin);
    return { message: 'Password reset successfully' };
  }

  /**
   * Toggle Active Status (Super Admin only)
   */
  async toggleAdminStatus(adminId: string) {
    const admin = await this.adminRepository.findOne({ where: { id: adminId } });
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    if (admin.role === AdminRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot deactivate Super Admin account');
    }

    admin.isActive = !admin.isActive;
    await this.adminRepository.save(admin);
    return { id: admin.id, isActive: admin.isActive };
  }

  /**
   * Delete Event Admin (Super Admin only)
   */
  async deleteEventAdmin(adminId: string) {
    const admin = await this.adminRepository.findOne({ where: { id: adminId } });
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    if (admin.role === AdminRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot delete Super Admin account');
    }

    await this.adminRepository.remove(admin);
    return { message: 'Admin deleted successfully' };
  }
}
