import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SavedFiltersService {
  constructor(private prisma: PrismaService) {}

  async createSavedFilter(tenantId: string, userId: string, name: string, filters: any) {
    try {
      return await this.prisma.savedFilter.create({
        data: {
          tenantId,
          userId,
          name,
          filters,
        },
      });
    } catch (error) {
      throw new InternalServerErrorException("Failed to save filter");
    }
  }

  async getSavedFilters(tenantId: string, userId: string) {
    try {
      return await this.prisma.savedFilter.findMany({
        where: {
          tenantId,
          userId, // only user's filters or we can make it tenant wide. Let's stick to user's for privacy.
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
    } catch (error) {
      throw new InternalServerErrorException("Failed to fetch saved filters");
    }
  }

  async deleteSavedFilter(filterId: string, tenantId: string, userId: string) {
    try {
      return await this.prisma.savedFilter.deleteMany({
        where: {
          id: filterId,
          tenantId,
          userId,
        },
      });
    } catch (error) {
      throw new InternalServerErrorException("Failed to delete saved filter");
    }
  }
}
