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

    let freeLimit = 3;
    if (subscription.planType) {
      const plan = await this.prisma.pricingPlan.findUnique({ where: { name: subscription.planType } });
      if (plan) {
        freeLimit = plan.freeRedownloads;
      }
    }
    const maxDownloadsBeforeCharge = freeLimit + 1; // 1 initial + free redownloads

    if (existingUnlock) {
      if (existingUnlock.downloadCount < maxDownloadsBeforeCharge) {
        // Free redownload
        const updated = await this.prisma.tenantUnlockedTender.update({
          where: { id: existingUnlock.id },
          data: { downloadCount: { increment: 1 } }
        });
        return { success: true, message: 'Free redownload', unlocked: updated };
      } else {
        // Redownload costs 1 credit again
        if (subscription.availableCredits < 1) {
          throw new BadRequestException('Not enough credits for redownload. Please upgrade your plan.');
        }
        
        const updated = await this.prisma.$transaction(async (tx) => {
          await tx.tenantSubscription.update({
            where: { id: subscription.id },
            data: { availableCredits: { decrement: 1 } }
          });
          
          await tx.creditTransaction.create({
            data: {
              tenantId,
              userId,
              amount: -1,
              description: `Paid Redownload for Tender`,
              tenderId
            }
          });
          
          return tx.tenantUnlockedTender.update({
            where: { id: existingUnlock.id },
            data: { downloadCount: 1 } // Reset for the next batch of redownloads
          });
        });
        
        return { success: true, message: 'Paid redownload', unlocked: updated };
      }
    }

    // 3. Check credits for first unlock
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

      await tx.creditTransaction.create({
        data: {
          tenantId,
          userId,
          amount: -1,
          description: `Unlocked Tender`,
          tenderId
        }
      });

      // Create unlock record
      const unlock = await tx.tenantUnlockedTender.create({
        data: { tenantId, tenderId, downloadCount: 1 }
      });

      return unlock;
    });

    return { success: true, message: 'Document unlocked successfully', unlocked: result };
  }

  /**
   * Get the download status of a tender to determine if the next download will be free or charged
   */
  async getDownloadStatus(userId: string, tenderId: string) {
    const member = await this.prisma.tenantMember.findFirst({
      where: { userId },
      include: { tenant: { include: { subscription: true } } }
    });

    if (!member || !member.tenant) {
      return { isUnlocked: false, downloadCount: 0, freeRedownloads: 3 };
    }

    let freeRedownloads = 3;
    if (member.tenant.subscription?.planType) {
      const plan = await this.prisma.pricingPlan.findUnique({ where: { name: member.tenant.subscription.planType } });
      if (plan) {
        freeRedownloads = plan.freeRedownloads;
      }
    }

    const unlock = await this.prisma.tenantUnlockedTender.findUnique({
      where: {
        tenantId_tenderId: { tenantId: member.tenant.id, tenderId }
      }
    });

    if (unlock) {
      return { isUnlocked: true, downloadCount: unlock.downloadCount, freeRedownloads };
    }
    return { isUnlocked: false, downloadCount: 0, freeRedownloads };
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

  /**
   * Get credit transaction history for the user's tenant
   */
  async getHistory(userId: string) {
    const member = await this.prisma.tenantMember.findFirst({
      where: { userId },
      select: { tenantId: true }
    });
    
    if (!member) return [];

    return this.prisma.creditTransaction.findMany({
      where: { tenantId: member.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
  }
}
