import { Controller, Get, Post, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReelsService } from './reels.service';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { FeedQueryDto, CreateCommentDto, ShareReelDto, CreateReelDto } from './dto/reels.dto';

@ApiTags('Reels')
@Controller('reels')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ReelsController {
    constructor(private readonly reelsService: ReelsService) { }

    @Post()
    @Roles(UserRole.STARTUP)
    @ApiOperation({ summary: 'Create a reel (publish pitch video to feed)' })
    @ApiResponse({ status: 201, description: 'Reel created/updated' })
    async createReel(@CurrentUser() user: User, @Body() dto: CreateReelDto) {
        return this.reelsService.createOrUpdateReel(user.id, dto);
    }

    @Get()
    @ApiOperation({ summary: 'Get feed (For You or Following)' })
    @ApiResponse({ status: 200, description: 'Feed retrieved successfully' })
    async getFeed(
        @CurrentUser() user: User,
        @Query() query: FeedQueryDto,
    ) {
        const type = query.type || 'for_you';
        if (type === 'following') {
            return this.reelsService.getFollowingFeed(user.id, query);
        }
        return this.reelsService.getForYouFeed(user.id, query);
    }

    @Get('me')
    @ApiOperation({ summary: "Get current startup user's own reels" })
    async getMyReels(@CurrentUser() user: User) {
        return this.reelsService.getMyReels(user.id);
    }

    @Get('pitch-count/me')
    @ApiOperation({ summary: "Get current startup user's pitch count and premium status" })
    async getPitchCount(@CurrentUser() user: User) {
        return this.reelsService.getPitchCount(user.id);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a single reel by ID' })
    @ApiResponse({ status: 200, description: 'Reel retrieved successfully' })
    @ApiResponse({ status: 404, description: 'Reel not found' })
    async getReelById(@Param('id') reelId: string, @CurrentUser() user: User) {
        return this.reelsService.getReelById(reelId, user.id);
    }

    @Delete(':id')
    @Roles(UserRole.STARTUP)
    @ApiOperation({ summary: "Delete a reel — only the startup founder can delete their own reel" })
    async deleteReel(@Param('id') reelId: string, @CurrentUser() user: User) {
        return this.reelsService.deleteReel(reelId, user.id);
    }

    @Post(':id/like')
    @ApiOperation({ summary: 'Like a reel' })
    @ApiResponse({ status: 201, description: 'Reel liked successfully' })
    @ApiResponse({ status: 409, description: 'Reel already liked' })
    async likeReel(@Param('id') reelId: string, @CurrentUser() user: User) {
        return this.reelsService.likeReel(reelId, user.id);
    }

    @Delete(':id/like')
    @ApiOperation({ summary: 'Unlike a reel' })
    @ApiResponse({ status: 200, description: 'Reel unliked successfully' })
    @ApiResponse({ status: 404, description: 'Like not found' })
    async unlikeReel(@Param('id') reelId: string, @CurrentUser() user: User) {
        return this.reelsService.unlikeReel(reelId, user.id);
    }

    @Post(':id/comment')
    @ApiOperation({ summary: 'Comment on a reel' })
    @ApiResponse({ status: 201, description: 'Comment created successfully' })
    async commentOnReel(
        @Param('id') reelId: string,
        @CurrentUser() user: User,
        @Body() dto: CreateCommentDto,
    ) {
        return this.reelsService.commentOnReel(reelId, user.id, dto);
    }

    @Get(':id/comments')
    @ApiOperation({ summary: 'Get reel comments' })
    @ApiResponse({ status: 200, description: 'Comments retrieved successfully' })
    async getComments(@Param('id') reelId: string) {
        return this.reelsService.getReelComments(reelId);
    }

    @Post(':id/share')
    @ApiOperation({ summary: 'Share a reel' })
    @ApiResponse({ status: 201, description: 'Reel shared successfully' })
    async shareReel(
        @Param('id') reelId: string,
        @CurrentUser() user: User,
        @Body() dto: ShareReelDto,
    ) {
        return this.reelsService.shareReel(reelId, user.id, dto);
    }

    @Post(':id/save')
    @ApiOperation({ summary: 'Save/bookmark a reel' })
    @ApiResponse({ status: 201, description: 'Reel saved successfully' })
    @ApiResponse({ status: 409, description: 'Reel already saved' })
    async saveReel(@Param('id') reelId: string, @CurrentUser() user: User) {
        return this.reelsService.saveReel(reelId, user.id);
    }

    @Delete(':id/save')
    @ApiOperation({ summary: 'Unsave/unbookmark a reel' })
    @ApiResponse({ status: 200, description: 'Reel unsaved successfully' })
    @ApiResponse({ status: 404, description: 'Save not found' })
    async unsaveReel(@Param('id') reelId: string, @CurrentUser() user: User) {
        return this.reelsService.unsaveReel(reelId, user.id);
    }

    @Post(':id/view')
    @ApiOperation({ summary: 'Track a view on a reel' })
    @ApiResponse({ status: 201, description: 'View tracked successfully' })
    async trackView(@Param('id') reelId: string, @CurrentUser() user: User) {
        return this.reelsService.trackView(reelId, user.id);
    }
}
