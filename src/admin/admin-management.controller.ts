import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { AdminRole } from './entities/admin.entity';
import { isSuperAdminIdentity } from '../users/admin-identity.util';
import {
  CreateEventAdminDto,
  UpdateEventAdminDto,
  ResetAdminPasswordDto,
} from './dto/admin-auth.dto';

@ApiTags('Admin Management')
@Controller('admin/management')
@UseGuards(SupabaseAuthGuard)
@ApiBearerAuth()
export class AdminManagementController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  private verifySuperAdmin(req: any) {
    if (!isSuperAdminIdentity(req)) {
      throw new ForbiddenException('Access denied. Super Admin privileges required.');
    }
  }

  @Get()
  @ApiOperation({ summary: 'List all Event Admins (Super Admin only)' })
  async getEventAdmins(@Req() req: any) {
    this.verifySuperAdmin(req);
    return this.adminAuthService.getEventAdmins();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new Event Admin (Super Admin only)' })
  async createEventAdmin(@Req() req: any, @Body() dto: CreateEventAdminDto) {
    this.verifySuperAdmin(req);
    return this.adminAuthService.createEventAdmin(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an Event Admin details (Super Admin only)' })
  async updateEventAdmin(
    @Req() req: any,
    @Param('id') adminId: string,
    @Body() dto: UpdateEventAdminDto,
  ) {
    this.verifySuperAdmin(req);
    return this.adminAuthService.updateEventAdmin(adminId, dto);
  }

  @Patch(':id/reset-password')
  @ApiOperation({ summary: 'Reset Event Admin password (Super Admin only)' })
  async resetAdminPassword(
    @Req() req: any,
    @Param('id') adminId: string,
    @Body() dto: ResetAdminPasswordDto,
  ) {
    this.verifySuperAdmin(req);
    return this.adminAuthService.resetAdminPassword(adminId, dto);
  }

  @Patch(':id/toggle-status')
  @ApiOperation({ summary: 'Enable or Disable an Event Admin (Super Admin only)' })
  async toggleAdminStatus(@Req() req: any, @Param('id') adminId: string) {
    this.verifySuperAdmin(req);
    return this.adminAuthService.toggleAdminStatus(adminId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an Event Admin (Super Admin only)' })
  async deleteEventAdmin(@Req() req: any, @Param('id') adminId: string) {
    this.verifySuperAdmin(req);
    return this.adminAuthService.deleteEventAdmin(adminId);
  }
}
