import { Controller, Post, Get, Body, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto/admin-auth.dto';

@ApiTags('Admin Authentication')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Admin Database Login' })
  async login(@Body() dto: AdminLoginDto) {
    return this.adminAuthService.login(dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get Current Logged in Admin Profile' })
  async getProfile(@Req() req: any) {
    const adminId = req.admin?.id || req.user?.id;
    if (!adminId) {
      throw new ForbiddenException('Admin session required');
    }
    return this.adminAuthService.getProfile(adminId);
  }
}
