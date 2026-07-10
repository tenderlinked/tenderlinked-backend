import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrganisationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllMappings(isMapped?: boolean) {
    const whereClause = isMapped !== undefined ? { isMapped } : {};
    return await this.prisma.organisationMapping.findMany({
      where: whereClause,
      orderBy: { rawName: 'asc' }
    });
  }

  async updateMapping(id: string, normalizedName: string) {
    return await this.prisma.organisationMapping.update({
      where: { id },
      data: {
        normalizedName,
        isMapped: true
      }
    });
  }
}
