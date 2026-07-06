import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ScraperTargetsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.scraperTarget.findMany({
      include: {
        regionState: true,
        regionDistrict: true
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const target = await this.prisma.scraperTarget.findUnique({ 
      where: { id },
      include: {
        regionState: true,
        regionDistrict: true
      }
    });
    if (!target) {
      throw new NotFoundException(`Target with ID ${id} not found`);
    }
    return target;
  }

  async create(data: { name: string; type: string; url: string; state?: string; regionStateId?: string; regionDistrictId?: string; isActive?: boolean }) {
    return this.prisma.scraperTarget.create({
      data: {
        name: data.name,
        type: data.type,
        url: data.url,
        state: data.state || 'Odisha',
        regionStateId: data.regionStateId,
        regionDistrictId: data.regionDistrictId,
        isActive: data.isActive ?? true,
      },
    });
  }

  async createBulk(targets: { name: string; type: string; url: string; state: string; regionStateId?: string; regionDistrictId?: string; isActive?: boolean }[]) {
    return this.prisma.scraperTarget.createMany({
      data: targets.map(t => ({
        name: t.name,
        type: t.type,
        url: t.url,
        state: t.state || 'Odisha',
        regionStateId: t.regionStateId,
        regionDistrictId: t.regionDistrictId,
        isActive: t.isActive ?? true
      })),
      skipDuplicates: true
    });
  }

  async update(id: string, data: { name?: string; type?: string; url?: string; state?: string; regionStateId?: string; regionDistrictId?: string; isActive?: boolean; isVerified?: boolean }) {
    await this.findOne(id);
    return this.prisma.scraperTarget.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.scraperTarget.delete({ where: { id } });
  }
}
