import { Controller, Post, Body, Headers, BadRequestException, Get, Param, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // ==========================================
  // RAZORPAY
  // ==========================================

  private extractAndVerifyUserId(req: any, expectedUserId: string) {
    const authHeader = req?.headers?.['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const payloadBase64 = token.split('.')[1];
        const decodedPayload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
        if (decodedPayload.sub === expectedUserId) return true;
      } catch (e) {
        // Ignore
      }
    }
    throw new BadRequestException("Unauthorized access to user payments");
  }

  @Post('create-order')
  async createOrder(@Req() req: any, @Body() body: { amount: number; userId: string; planType: string }) {
    this.extractAndVerifyUserId(req, body.userId);
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
  async createSubscription(@Req() req: any, @Body() body: { userId: string; planType: string }) {
    this.extractAndVerifyUserId(req, body.userId);
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

  @Post('cancel-and-upgrade')
  async cancelAndUpgrade(@Req() req: any, @Body() body: { userId: string; planType: string }) {
    this.extractAndVerifyUserId(req, body.userId);
    return this.paymentsService.cancelAndUpgrade(body.userId, body.planType);
  }

  @Post('change-plan')
  async changePlan(@Req() req: any, @Body() body: { userId: string; planType: string }) {
    this.extractAndVerifyUserId(req, body.userId);
    return this.paymentsService.changePlanDirectly(body.userId, body.planType);
  }

  @Post('free-activate')
  async freeActivate(@Req() req: any, @Body() body: { userId: string; planType: string }) {
    this.extractAndVerifyUserId(req, body.userId);
    await this.paymentsService.createSubscriptionAfterSuccess(
      body.userId,
      body.planType,
      "FREE",
      `free_${body.userId.substring(0, 8)}_${Date.now()}`,
      0,
      false
    );
    return { success: true };
  }

  @Post('webhook')
  async handleWebhook(@Body() body: any, @Headers('x-razorpay-signature') signature: string) {
    if (!signature) {
      throw new BadRequestException("Missing signature");
    }
    return this.paymentsService.handleWebhook(body, signature);
  }

  @Post('cancel-subscription')
  async cancelSubscription(@Req() req: any, @Body() body: { userId: string }) {
    if (!body.userId) {
      throw new BadRequestException("Missing userId");
    }
    this.extractAndVerifyUserId(req, body.userId);
    return this.paymentsService.cancelSubscription(body.userId);
  }
}
