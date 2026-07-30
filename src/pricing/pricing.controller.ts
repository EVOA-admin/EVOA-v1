import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PricingService } from './pricing.service';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';

@ApiTags('Pricing')
@Controller()
export class PricingController {
    constructor(private readonly pricingService: PricingService) { }

    @Get('pricing')
    @ApiOperation({ summary: 'Get pricing plans for startups, investors, and ambassadors' })
    getPricing() {
        return this.pricingService.getPricing();
    }

    @Post('create-order')
    @UseGuards(SupabaseAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Prepare a subscription order for Razorpay checkout' })
    createOrder(@CurrentUser() user: User, @Body() dto: CreateOrderDto) {
        return this.pricingService.createOrder(user, dto);
    }

    @Post('verify-payment')
    @UseGuards(SupabaseAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Verify a Razorpay payment and activate the subscription' })
    verifyPayment(@CurrentUser() user: User, @Body() dto: VerifyPaymentDto) {
        return this.pricingService.verifyPayment(user, dto);
    }

    @Post('create-event-order')
    @UseGuards(SupabaseAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create a Razorpay order for an EVOA event pass' })
    createEventOrder(
        @CurrentUser() user: User,
        @Body() dto?: { eventId?: string; amount?: number; eventType?: string },
    ) {
        return this.pricingService.createEventOrder(user, dto?.eventId, dto?.amount, dto?.eventType);
    }
}
