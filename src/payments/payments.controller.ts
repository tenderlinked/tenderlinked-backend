import { Controller, Post, Body, Headers, BadRequestException, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // ==========================================
  // RAZORPAY
  // ==========================================

  @Post('create-order')
  async createOrder(@Body() body: { amount: number; userId: string; planType: string }) {
    return this.paymentsService.createOrder(body.userId, body.planType, body.amount);
  }

  @Post('verify')
  async verifyPayment(
    @Body()
    body: {
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
      userId: string;
      planType: string;
      amount: number;
    },
  ) {
    return this.paymentsService.verifyPayment(
      body.razorpayOrderId,
      body.razorpayPaymentId,
      body.razorpaySignature,
      body.userId,
      body.planType,
      body.amount
    );
  }
  @Get('trial-eligibility/:userId')
  async checkTrialEligibility(@Param('userId') userId: string) {
    return this.paymentsService.checkTrialEligibility(userId);
  }

  @Post('create-subscription')
  async createSubscription(@Body() body: { userId: string; planType: string }) {
    return this.paymentsService.createSubscription(body.userId, body.planType);
  }

  @Post('verify-subscription')
  async verifySubscription(
    @Body()
    body: {
      razorpayPaymentId: string;
      razorpaySubscriptionId: string;
      razorpaySignature: string;
      userId: string;
      planType: string;
      amount: number;
    },
  ) {
    return this.paymentsService.verifySubscription(
      body.razorpayPaymentId,
      body.razorpaySubscriptionId,
      body.razorpaySignature,
      body.userId,
      body.planType,
      body.amount
    );
  }

  @Post('webhook')
  async handleWebhook(@Body() body: any, @Headers('x-razorpay-signature') signature: string) {
    if (!signature) {
      throw new BadRequestException("Missing signature");
    }
    return this.paymentsService.handleWebhook(body, signature);
  }

  @Post('cancel-subscription')
  async cancelSubscription(@Body() body: { userId: string }) {
    if (!body.userId) {
      throw new BadRequestException("Missing userId");
    }
    return this.paymentsService.cancelSubscription(body.userId);
  }
}
