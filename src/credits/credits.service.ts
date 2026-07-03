import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CreditsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Unlock a tender for a tenant, deducting 1 credit if not already unlocked.
   */
  async unlockTender(userId: string, tenderId: string) {
    // 1. Get tenant info
    const member = await this.prisma.tenantMember.findFirst({
      where: { userId },
      include: { tenant: { include: { subscription: true } } }
    });

    if (!member || !member.tenant) {
      throw new NotFoundException('User is not part of a tenant');
    }

    const tenantId = member.tenant.id;
    const subscription = member.tenant.subscription;

    if (!subscription) {
      throw new BadRequestException('No active subscription found');
    }

    // 2. Check if already unlocked
    const existingUnlock = await this.prisma.tenantUnlockedTender.findUnique({
      where: {
        tenantId_tenderId: { tenantId, tenderId }
      }
    });

    if (existingUnlock) {
      return { success: true, message: 'Tender is already unlocked', unlocked: existingUnlock };
    }

    // 3. Check credits
    if (subscription.availableCredits < 1) {
      throw new BadRequestException('Not enough credits to unlock this document. Please upgrade your plan.');
    }

    // 4. Perform transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Deduct credit
      await tx.tenantSubscription.update({
        where: { id: subscription.id },
        data: { availableCredits: { decrement: 1 } }
      });

      // Create unlock record
      const unlock = await tx.tenantUnlockedTender.create({
        data: { tenantId, tenderId }
      });

      return unlock;
    });

    return { success: true, message: 'Document unlocked successfully', unlocked: result };
  }

  /**
   * Get current credit balance and usage
   */
  async getUsage(userId: string) {
    const member = await this.prisma.tenantMember.findFirst({
      where: { userId },
      include: { 
        tenant: { 
          include: { 
            subscription: true,
            roles: true, 
          } 
        } 
      }
    });

    if (!member || !member.tenant?.subscription) {
      return { availableCredits: 0, tendersViewedThisMonth: 0, maxTenderViews: 0 };
    }

    const sub = member.tenant.subscription;
    
    // Get plan limits
    let maxTenderViews = 50; // fallback
    if (sub.planType) {
      const plan = await this.prisma.pricingPlan.findUnique({ where: { name: sub.planType } });
      if (plan) {
        maxTenderViews = plan.maxTenderViews;
      }
    }

    return {
      availableCredits: sub.availableCredits,
      tendersViewedThisMonth: sub.tendersViewedThisMonth,
      maxTenderViews
    };
  }
}
