import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { AdminService } from './admin.service';
import { AdminRole } from './entities/admin.entity';
import {
    AddBattlegroundStartupDto,
    AdminInvestorsQueryDto,
    AdminStartupsQueryDto,
    AdminUsersQueryDto,
    DeclareBattlegroundWinnerDto,
    UpdateAdminInvestorDto,
    UpdateAdminStartupDto,
    UpdateAdminUserDto,
    UpdateBattlegroundRegistrationDto,
} from './dto/admin.dto';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class AdminController {
    constructor(private readonly adminService: AdminService) { }

    private checkSuperAdmin(req: any) {
        const role = req.admin?.role || req.user?.adminRole;
        if (role === AdminRole.EVENT_ADMIN) {
            throw new ForbiddenException('Access denied. Event Admins can only access the Events module.');
        }
    }

    @Get('session')
    @ApiOperation({ summary: 'Get current admin session details' })
    getSession(@Req() req: any, @CurrentUser() user: User) {
        if (req.admin) {
            return {
                id: req.admin.id,
                email: req.admin.email,
                fullName: req.admin.fullName,
                companyName: req.admin.companyName,
                role: req.admin.role,
                isActive: req.admin.isActive,
            };
        }
        return this.adminService.getSession(user);
    }

    @Get('overview')
    @ApiOperation({ summary: 'Get admin dashboard overview metrics' })
    getOverview(@Req() req: any) {
        return this.adminService.getOverview();
    }

    @Get('users')
    @ApiOperation({ summary: 'Get admin user management table' })
    getUsers(@Req() req: any, @Query() query: AdminUsersQueryDto) {
        this.checkSuperAdmin(req);
        return this.adminService.getUsers(query);
    }

    @Patch('users/:id')
    @ApiOperation({ summary: 'Update admin-managed user state' })
    updateUser(@Req() req: any, @Param('id') userId: string, @Body() dto: UpdateAdminUserDto) {
        this.checkSuperAdmin(req);
        return this.adminService.updateUser(userId, dto);
    }

    @Get('startups')
    @ApiOperation({ summary: 'Get startup management data' })
    getStartups(@Req() req: any, @Query() query: AdminStartupsQueryDto) {
        this.checkSuperAdmin(req);
        return this.adminService.getStartups(query);
    }

    @Patch('startups/:id')
    @ApiOperation({ summary: 'Update admin-managed startup state' })
    updateStartup(@Req() req: any, @Param('id') startupId: string, @Body() dto: UpdateAdminStartupDto) {
        this.checkSuperAdmin(req);
        return this.adminService.updateStartup(startupId, dto);
    }

    @Delete('startups/:startupId/pitches/:reelId')
    @ApiOperation({ summary: 'Remove a startup pitch' })
    removeStartupPitch(@Req() req: any, @Param('startupId') startupId: string, @Param('reelId') reelId: string) {
        this.checkSuperAdmin(req);
        return this.adminService.removeStartupPitch(startupId, reelId);
    }

    @Get('investors')
    @ApiOperation({ summary: 'Get investor management data' })
    getInvestors(@Req() req: any, @Query() query: AdminInvestorsQueryDto) {
        this.checkSuperAdmin(req);
        return this.adminService.getInvestors(query);
    }

    @Patch('investors/:userId')
    @ApiOperation({ summary: 'Update admin-managed investor state' })
    updateInvestor(@Req() req: any, @Param('userId') userId: string, @Body() dto: UpdateAdminInvestorDto) {
        this.checkSuperAdmin(req);
        return this.adminService.updateInvestor(userId, dto);
    }

    @Get('battleground')
    @ApiOperation({ summary: 'Get battleground control panel data' })
    getBattleground(@Req() req: any) {
        this.checkSuperAdmin(req);
        return this.adminService.getBattleground();
    }

    @Post('battleground/registrations')
    @ApiOperation({ summary: 'Manually add a startup to battleground' })
    addBattlegroundStartup(@Req() req: any, @Body() dto: AddBattlegroundStartupDto) {
        this.checkSuperAdmin(req);
        return this.adminService.addBattlegroundStartup(dto);
    }

    @Patch('battleground/registrations/:id')
    @ApiOperation({ summary: 'Override selected battleground pitch' })
    updateBattlegroundRegistration(@Req() req: any, @Param('id') registrationId: string, @Body() dto: UpdateBattlegroundRegistrationDto) {
        this.checkSuperAdmin(req);
        return this.adminService.updateBattlegroundRegistration(registrationId, dto);
    }

    @Delete('battleground/registrations/:id')
    @ApiOperation({ summary: 'Remove a startup from battleground' })
    removeBattlegroundRegistration(@Req() req: any, @Param('id') registrationId: string) {
        this.checkSuperAdmin(req);
        return this.adminService.removeBattlegroundRegistration(registrationId);
    }

    @Patch('battleground/winner')
    @ApiOperation({ summary: 'Declare the battleground winner and prize details' })
    declareBattlegroundWinner(@Req() req: any, @Body() dto: DeclareBattlegroundWinnerDto) {
        this.checkSuperAdmin(req);
        return this.adminService.declareBattlegroundWinner(dto);
    }

    @Get('payments')
    @ApiOperation({ summary: 'Get payment monitoring data' })
    getPayments(@Req() req: any) {
        this.checkSuperAdmin(req);
        return this.adminService.getPayments();
    }
}
