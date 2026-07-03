import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class TenantRoleGuard implements CanActivate {
  constructor(private prisma: PrismaService, private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    let authUserId: string | null = null;
    
    // --- Super Admin Impersonation Bypass ---
    // If the requester is a Super Admin, we let them pass immediately.
    const authHeader = request.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const payloadBase64 = token.split('.')[1];
        const decodedPayload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
        
        const email = decodedPayload.email;
        const sub = decodedPayload.sub;
        authUserId = sub;
        
        const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS || 'admin@enfycon.com,sahadebbarman@gmail.com,deb@enfycon.com').split(',').map(e => e.trim().toLowerCase());
        const roles = decodedPayload?.realm_access?.roles || [];
        
        if ((email && superAdminEmails.includes(email.toLowerCase())) || roles.includes('SUPER_ADMIN') || roles.includes('super_admin')) {
          return true;
        }

        if (sub) {
          const userProfile = await this.prisma.userProfile.findUnique({ where: { userId: sub } });
          if (userProfile?.globalRole === 'SUPER_ADMIN') return true;
        }
      } catch (e) {
        // Ignore and fallback to standard tenant check
      }
    }
    // -----------------------------------------

    // Use JWT sub as userId, or fallback to headers/body
    const userId = authUserId || request.body?.userId || request.headers['x-user-id'];
    let tenantIdOrSubdomain = request.params?.tenantId || request.body?.tenantId || request.headers['x-tenant-id'];

    if (!userId) {
      throw new ForbiddenException('User ID is missing');
    }

    if (!tenantIdOrSubdomain) {
      // If no explicit tenantId is provided, fallback to finding their first tenant
      const member = await this.prisma.tenantMember.findFirst({
        where: { userId },
        include: { customRole: true }
      });
      if (!member) throw new ForbiddenException('User does not belong to any tenant');
      
      return this.checkPermissions(context, member);
    }

    // Check if tenantIdOrSubdomain is a subdomain (not a uuid)
    let actualTenantId = tenantIdOrSubdomain;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actualTenantId)) {
      const tenant = await this.prisma.tenant.findUnique({ where: { subdomain: actualTenantId } });
      if (!tenant) throw new ForbiddenException('Tenant not found');
      actualTenantId = tenant.id;
      // also mutate the request params so controllers get the UUID instead of the subdomain!
      if (request.params?.tenantId) {
        request.params.tenantId = actualTenantId;
      }
    }

    const member = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId: actualTenantId, userId } },
      include: { customRole: true }
    });

    if (!member) {
      throw new ForbiddenException('You do not belong to this tenant');
    }

    return this.checkPermissions(context, member);
  }

  private checkPermissions(context: ExecutionContext, member: any): boolean {
    // Workspace owner has full access (and bypasses granular permissions)
    if (member.isOwner) return true;

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no specific permissions are required, just being a valid tenant member is enough
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const userPermissions = member.customRole?.permissions || [];
    
    // Check if user has ALL required permissions, or the wildcard '*'
    if (userPermissions.includes('*')) return true;

    const hasAll = requiredPermissions.every(perm => userPermissions.includes(perm));
    if (!hasAll) {
      throw new ForbiddenException(`Missing required permissions. Needed: ${requiredPermissions.join(', ')}`);
    }

    return true;
  }
}
