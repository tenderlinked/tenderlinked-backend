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
    const internalSecret = process.env.INTERNAL_API_SECRET || 'fallback-internal-secret-xyz';
    if (req.headers['x-internal-secret'] !== internalSecret) {
      throw new UnauthorizedException('Invalid internal API secret');
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
