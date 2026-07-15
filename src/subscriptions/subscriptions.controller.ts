import { Controller, Get, Param, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get(':userId/active')
  async getActiveSubscription(@Param('userId') userId: string, @Req() req: Request) {
    let tokenUserId: string | null = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const payloadBase64 = token.split('.')[1];
        const decodedPayload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
        tokenUserId = decodedPayload.sub;
      } catch (e) {}
    }

    const internalSecret = process.env.INTERNAL_API_SECRET || 'fallback-internal-secret-xyz';
    if (req.headers['x-internal-secret'] !== internalSecret && tokenUserId !== userId) {
      throw new UnauthorizedException('Invalid internal API secret or unauthorized token');
    }
    console.log(`[Subscriptions] Checking active plan for user: ${userId}`);
    const sub = await this.subscriptionsService.getActiveSubscription(userId);
    console.log(`[Subscriptions] Result for ${userId}: ${!!sub}`);
    return {
      hasActivePlan: !!sub,
      subscription: sub,
    };
  }
}
