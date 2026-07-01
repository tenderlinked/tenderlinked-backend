import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService) {}

  async getActiveSubscription(userId: string) {
    const sub = await this.prisma.tenantSubscription.findFirst({
      where: {
        tenant: {
          members: { some: { userId } }
        },
        status: { in: ['ACTIVE', 'CANCELLED_PENDING'] },
        endDate: {
          gte: new Date(),
        },
      },
      orderBy: {
        endDate: 'desc',
      },
    });
    
    return sub;
  }
}
