import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlansService {
  constructor(private prisma: PrismaService) {}

  async create(data: { 
    name: string; 
    price?: number; 
    allowedTenderFields: string[]; 
    isDefault?: boolean;
    monthlyCredits?: number;
    maxKeywords?: number;
    maxStates?: number;
    maxTenderViews?: number;
    hasEmailAlerts?: boolean;
    hasWhatsappAlerts?: boolean;
    hasSmsAlerts?: boolean;
    freeRedownloads?: number;
  }) {
    if (data.isDefault) {
      // Unset any existing default
      await this.prisma.pricingPlan.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }
    
    return this.prisma.pricingPlan.create({
      data: {
        name: data.name,
        price: data.price,
        allowedTenderFields: data.allowedTenderFields,
        isDefault: data.isDefault ?? false,
        monthlyCredits: data.monthlyCredits ?? 0,
        maxKeywords: data.maxKeywords ?? 3,
        maxStates: data.maxStates ?? 1,
        maxTenderViews: data.maxTenderViews ?? 50,
        hasEmailAlerts: data.hasEmailAlerts ?? false,
        hasWhatsappAlerts: data.hasWhatsappAlerts ?? false,
        hasSmsAlerts: data.hasSmsAlerts ?? false,
        freeRedownloads: data.freeRedownloads ?? 3,
      },
    });
  }

  async findAll() {
    return this.prisma.pricingPlan.findMany({
      orderBy: { price: 'asc' },
    });
  }

  async findOne(id: string) {
    const plan = await this.prisma.pricingPlan.findUnique({
      where: { id },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async update(id: string, data: { 
    name?: string; 
    price?: number; 
    allowedTenderFields?: string[]; 
    isDefault?: boolean;
    monthlyCredits?: number;
    maxKeywords?: number;
    maxStates?: number;
    maxTenderViews?: number;
    hasEmailAlerts?: boolean;
    hasWhatsappAlerts?: boolean;
    hasSmsAlerts?: boolean;
    freeRedownloads?: number;
  }) {
    if (data.isDefault) {
      await this.prisma.pricingPlan.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    return this.prisma.pricingPlan.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    return this.prisma.pricingPlan.delete({
      where: { id },
    });
  }
}
