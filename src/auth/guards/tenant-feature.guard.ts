import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantFeatureGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.body?.userId || request.headers['x-user-id'];

    if (!userId) {
      throw new ForbiddenException('User ID is missing');
    }

    const member = await this.prisma.tenantMember.findFirst({
      where: { userId },
      include: { tenant: true }
    });

    if (!member) {
      throw new ForbiddenException('User does not belong to any tenant');
    }

    const subscription = await this.prisma.tenantSubscription.findUnique({
      where: { tenantId: member.tenantId }
    });

    // If no active subscription and it's not a trial, block access to premium features
    // Currently, let's assume all basic actions require an active subscription
    if (!subscription || (subscription.status !== 'ACTIVE' && subscription.status !== 'CANCELLED_PENDING')) {
      throw new ForbiddenException(`Tenant subscription is ${subscription?.status || 'MISSING'}. Upgrade required.`);
    }

    // Attach tenant context to the request for downstream controllers
    request.tenant = member.tenant;
    request.subscription = subscription;
    request.tenantMember = member;

    return true;
  }
}
