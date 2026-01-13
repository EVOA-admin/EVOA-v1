import { IsOptional, IsString, IsInt, Min, Max, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class FeedQueryDto {
    @ApiProperty({ required: false, description: 'Cursor for pagination' })
    @IsOptional()
    @IsString()
    cursor?: string;

    @ApiProperty({ required: false, default: 20, minimum: 1, maximum: 50 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    limit?: number = 20;
}

export class CreateCommentDto {
    @ApiProperty({ example: 'Great pitch!' })
    @IsString()
    content: string;

    @ApiProperty({ required: false, description: 'Parent comment ID for replies' })
    @IsOptional()
    @IsUUID()
    parentCommentId?: string;
}

export class ShareReelDto {
    @ApiProperty({ example: 'twitter', required: false })
    @IsOptional()
    @IsString()
    platform?: string;
}
