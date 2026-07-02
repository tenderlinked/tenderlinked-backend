import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ForbiddenException('Missing or invalid Authorization header. A valid Keycloak token is required.');
    }

    const token = authHeader.split(' ')[1];

    try {
      const payloadBase64 = token.split('.')[1];
      const decodedPayload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
      
      const userId = decodedPayload.sub;
      const email = decodedPayload.email;

      // 1. Check if email is in the hardcoded list of Super Admins (Option 2)
      const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS || 'admin@enfycon.com,sahadebbarman@gmail.com,deb@enfycon.com').split(',').map(e => e.trim().toLowerCase());
      if (email && superAdminEmails.includes(email.toLowerCase())) {
        return true;
      }

      // 2. Fallback to Database Tag Check
      if (userId) {
        const userProfile = await this.prisma.userProfile.findUnique({
          where: { userId }
        });
        
        if (userProfile?.globalRole === 'SUPER_ADMIN') {
          return true;
        }
      }

      // 3. Fallback to Keycloak roles
      const roles = decodedPayload?.realm_access?.roles || [];
      if (roles.includes('SUPER_ADMIN') || roles.includes('super_admin')) {
        return true;
      }

      throw new ForbiddenException('Access Denied: You are not recognized as a Super Admin.');
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      throw new ForbiddenException('Invalid token format or failed to decode Keycloak token.');
    }
  }
}
