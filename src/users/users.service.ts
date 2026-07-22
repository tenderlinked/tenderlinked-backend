import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly emailService: EmailService) {}

  async createProfile(userId: string, email?: string, phoneNumber?: string, companyName?: string, username?: string, isKeycloakSuperAdmin?: boolean) {
    try {
      // 1. Create the User Profile
      // @ts-ignore
      const profile = await this.prisma.userProfile.create({
        data: {
          userId,
          email,
          phoneNumber,
          companyName,
          globalRole: isKeycloakSuperAdmin ? 'SUPER_ADMIN' : 'USER',
        },
      });

      // 2. Create a default Tenant for the user based on their company name or ID
      const tenantName = companyName || `Workspace_${userId.substring(0, 5)}`;
      
      const tenant = await this.prisma.tenant.create({
        data: {
          name: tenantName,
        },
      });

      // Fetch the default admin role
      const defaultAdminRole = await this.prisma.role.findFirst({
        where: { isDefaultAdmin: true, isSystemRole: true }
      });

      // 3. Assign the user as the OWNER of this new Tenant, and assign the default admin role
      await this.prisma.tenantMember.create({
        data: {
          userId,
          tenantId: tenant.id,
          role: 'OWNER',
          roleId: defaultAdminRole?.id || undefined
        },
      });

      // 4. Send Welcome Email asynchronously
      if (email) {
        this.emailService.sendWelcomeEmail(email, username || email.split('@')[0]).catch(e => console.error('Failed to send welcome email:', e));
      }

      return {
        ...profile,
        tenantId: tenant.id
      };
    } catch (error) {
      console.error('Error creating user profile & tenant:', error);
      throw new InternalServerErrorException('Failed to create user profile');
    }
  }

  async getProfile(userId: string, email?: string, isKeycloakSuperAdmin?: boolean) {
    let profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    
    // Sync email and role from Keycloak if missing or outdated
    let needsUpdate = false;
    const updateData: any = {};
    
    if (profile && email && (profile as any).email !== email) {
      updateData.email = email;
      needsUpdate = true;
    }
    
    if (profile && isKeycloakSuperAdmin && (profile as any).globalRole !== 'SUPER_ADMIN') {
      updateData.globalRole = 'SUPER_ADMIN';
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      // @ts-ignore
      profile = await this.prisma.userProfile.update({
        where: { userId },
        data: updateData
      });
    }
    
    let member = await this.prisma.tenantMember.findFirst({
      where: { userId },
      include: { 
        customRole: true,
        tenant: {
          include: { subscription: true }
        }
      }
    });

    // Auto-create profile and tenant if they don't exist (e.g., OAuth login without going through registration form)
    if (!profile || !member) {
      if (!profile) {
        // Try creating profile and tenant
        const newProfile = await this.createProfile(userId, email, undefined, undefined, undefined, isKeycloakSuperAdmin);
        profile = await this.prisma.userProfile.findUnique({ where: { userId } });
      } else if (!member) {
        // User has a profile but no tenant, let's create a default tenant for them
        const tenantName = profile.companyName || `Workspace_${userId.substring(0, 5)}`;
        const tenant = await this.prisma.tenant.create({ data: { name: tenantName } });
        
        const defaultAdminRole = await this.prisma.role.findFirst({ where: { isDefaultAdmin: true, isSystemRole: true } });
        
        member = await this.prisma.tenantMember.create({
          data: {
            userId,
            tenantId: tenant.id,
            role: 'OWNER',
            roleId: defaultAdminRole?.id || undefined
          },
          include: { customRole: true, tenant: { include: { subscription: true } } }
        });
      }
    }
    
    return {
      ...profile,
      tenant: member?.tenant,
      role: member?.customRole?.name || member?.role,
      permissions: member?.customRole?.permissions || (member?.role === 'OWNER' ? ['*'] : ['tenders:read', 'bookmarks:manage', 'keywords:read', 'alerts:manage'])
    };
  }

  async updateProfile(userId: string, data: any) {
    return this.prisma.userProfile.update({
      where: { userId },
      data,
    });
  }

  async checkPhone(phoneNumber: string) {
    const profile = await this.prisma.userProfile.findFirst({
      where: { phoneNumber },
    });
    return { available: !profile };
  }

  async promoteToSuperAdmin(userId: string) {
    return this.prisma.userProfile.update({
      where: { userId },
      data: { globalRole: 'SUPER_ADMIN' }
    });
  }
}
