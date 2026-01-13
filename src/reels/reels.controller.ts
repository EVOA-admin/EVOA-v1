import { Controller, Get, Post, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReelsService } from './reels.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { FeedQueryDto, CreateCommentDto, ShareReelDto } from './dto/reels.dto';

@ApiTags('Reels')
@Controller('reels')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReelsController {
    constructor(private readonly reelsService: ReelsService) { }

    @Get()
    @ApiOperation({ summary: 'Get feed (For You or Following)' })
    @ApiQuery({ name: 'type', enum: ['for_you', 'following'], required: true })
    @ApiQuery({ name: 'cursor', required: false })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiResponse({ status: 200, description: 'Feed retrieved successfully' })
    async getFeed(
        @CurrentUser() user: User,
        @Query('type') type: 'for_you' | 'following',
        @Query() query: FeedQueryDto,
    ) {
        if (type === 'following') {
            return this.reelsService.getFollowingFeed(user.id, query);
        }
        return this.reelsService.getForYouFeed(user.id, query);
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
}
