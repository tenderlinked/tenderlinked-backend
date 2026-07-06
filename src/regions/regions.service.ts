import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RegionsService {
  constructor(private prisma: PrismaService) {}

  async getAllStates() {
    return this.prisma.regionState.findMany({
      include: {
        districts: {
          orderBy: { name: 'asc' }
        }
      },
      orderBy: { name: 'asc' }
    });
  }

  async createState(name: string) {
    return this.prisma.regionState.create({
      data: { name }
    });
  }

  async updateState(id: string, name: string) {
    return this.prisma.regionState.update({
      where: { id },
      data: { name }
    });
  }

  async deleteState(id: string) {
    return this.prisma.regionState.delete({
      where: { id }
    });
  }

  async createDistrict(stateId: string, name: string) {
    return this.prisma.regionDistrict.create({
      data: { name, stateId }
    });
  }

  async updateDistrict(id: string, name: string) {
    return this.prisma.regionDistrict.update({
      where: { id },
      data: { name }
    });
  }

  async deleteDistrict(id: string) {
    return this.prisma.regionDistrict.delete({
      where: { id }
    });
  }
}
