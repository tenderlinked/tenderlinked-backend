import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantRoleGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // In Phase 3, the user context will be populated by Keycloak/Auth middleware
    // For now, we expect userId and tenantId to be passed in the body or headers
    const userId = request.body?.userId || request.headers['x-user-id'];
    const tenantId = request.body?.tenantId || request.headers['x-tenant-id'];

    if (!userId) {
      throw new ForbiddenException('User ID is missing');
    }

    if (!tenantId) {
      // If no explicit tenantId is provided, fallback to finding their first tenant
      const member = await this.prisma.tenantMember.findFirst({
        where: { userId }
      });
      if (!member) throw new ForbiddenException('User does not belong to any tenant');
      
      // We only allow OWNER or ADMIN to perform sensitive tenant actions
      if (member.role !== 'OWNER' && member.role !== 'ADMIN') {
        throw new ForbiddenException(`Access Denied: Requires OWNER or ADMIN role (Current: ${member.role})`);
      }
      return true;
    }

    const member = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } }
    });

    if (!member) {
      throw new ForbiddenException('You do not belong to this tenant');
    }

    if (member.role !== 'OWNER' && member.role !== 'ADMIN') {
      throw new ForbiddenException(`Access Denied: Requires OWNER or ADMIN role (Current: ${member.role})`);
    }

    return true;
  }
}
