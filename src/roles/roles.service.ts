import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async getSystemRoles() {
    return this.prisma.role.findMany({
      where: { isSystemRole: true },
      orderBy: { name: 'asc' }
    });
  }

  async createSystemRole(data: { name: string, description?: string, permissions: string[], isDefaultAdmin?: boolean, isDefaultUser?: boolean }) {
    if (data.isDefaultAdmin) await this.prisma.role.updateMany({ where: { isSystemRole: true, isDefaultAdmin: true }, data: { isDefaultAdmin: false } });
    if (data.isDefaultUser) await this.prisma.role.updateMany({ where: { isSystemRole: true, isDefaultUser: true }, data: { isDefaultUser: false } });

    return this.prisma.role.create({
      data: {
        name: data.name,
        description: data.description,
        permissions: data.permissions,
        isSystemRole: true,
        isDefaultAdmin: data.isDefaultAdmin || false,
        isDefaultUser: data.isDefaultUser || false,
      }
    });
  }

  async updateSystemRole(roleId: string, data: { name?: string, description?: string, permissions?: string[], isDefaultAdmin?: boolean, isDefaultUser?: boolean }) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, isSystemRole: true }
    });
    
    if (!role) {
      throw new NotFoundException("System role not found.");
    }
    
    if (data.isDefaultAdmin) await this.prisma.role.updateMany({ where: { isSystemRole: true, isDefaultAdmin: true, id: { not: roleId } }, data: { isDefaultAdmin: false } });
    if (data.isDefaultUser) await this.prisma.role.updateMany({ where: { isSystemRole: true, isDefaultUser: true, id: { not: roleId } }, data: { isDefaultUser: false } });

    return this.prisma.role.update({
      where: { id: roleId },
      data
    });
  }

  async deleteSystemRole(roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, isSystemRole: true }
    });
    
    if (!role) {
      throw new NotFoundException("System role not found.");
    }
    
    // Check if role is in use
    const membersWithRole = await this.prisma.tenantMember.count({
      where: { roleId }
    });
    
    if (membersWithRole > 0) {
      throw new Error("Cannot delete system role that is currently assigned to users.");
    }
    
    return this.prisma.role.delete({
      where: { id: roleId }
    });
  }

  async bulkDeleteSystemRoles(roleIds: string[]) {
    // Check if any role is in use
    const membersWithRole = await this.prisma.tenantMember.count({
      where: { roleId: { in: roleIds } }
    });
    
    if (membersWithRole > 0) {
      throw new Error("Cannot delete system roles: one or more roles are currently assigned to users.");
    }
    
    return this.prisma.role.deleteMany({
      where: { 
        id: { in: roleIds },
        isSystemRole: true
      }
    });
  }

  async getTenantRoles(tenantId: string) {
    return this.prisma.role.findMany({
      where: {
        OR: [
          { tenantId },
          { isSystemRole: true }
        ]
      },
      orderBy: { name: 'asc' }
    });
  }

  async createTenantRole(tenantId: string, data: { name: string, description?: string, permissions: string[] }) {
    return this.prisma.role.create({
      data: {
        name: data.name,
        description: data.description,
        permissions: data.permissions,
        tenantId,
        isSystemRole: false
      }
    });
  }

  async updateTenantRole(tenantId: string, roleId: string, data: { name?: string, description?: string, permissions?: string[] }) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, tenantId }
    });
    
    if (!role) {
      throw new NotFoundException("Custom role not found in this tenant.");
    }
    
    return this.prisma.role.update({
      where: { id: roleId },
      data
    });
  }

  async deleteTenantRole(tenantId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, tenantId }
    });
    
    if (!role) {
      throw new NotFoundException("Custom role not found in this tenant.");
    }
    
    // Check if role is in use
    const membersWithRole = await this.prisma.tenantMember.count({
      where: { roleId }
    });
    
    if (membersWithRole > 0) {
      throw new Error("Cannot delete role that is currently assigned to members.");
    }
    
    return this.prisma.role.delete({
      where: { id: roleId }
    });
  }
}
