import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Subscriptions')
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
