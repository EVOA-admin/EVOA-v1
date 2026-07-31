import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BookTicketDto {
    @ApiProperty()
    @IsString()
    eventId: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsNumber()
    price?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    userRole?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    orderId?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    paymentId?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    userName?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    userEmail?: string;
}
