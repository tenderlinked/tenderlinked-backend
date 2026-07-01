import { Controller, Get, Param } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get(':userId/active')
  async getActiveSubscription(@Param('userId') userId: string) {
    console.log(`[Subscriptions] Checking active plan for user: ${userId}`);
    const sub = await this.subscriptionsService.getActiveSubscription(userId);
    console.log(`[Subscriptions] Result for ${userId}: ${!!sub}`);
    return {
      hasActivePlan: !!sub,
      subscription: sub,
    };
  }
}
