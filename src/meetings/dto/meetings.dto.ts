import { IsOptional, IsString, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ScheduleMeetingDto {
    @ApiProperty({ required: false, description: 'Meeting notes or message' })
    @IsOptional()
    @IsString()
    notes?: string;

    @ApiProperty({ required: false, description: 'Proposed meeting time' })
    @IsOptional()
    @IsDateString()
    scheduledAt?: Date;
}
