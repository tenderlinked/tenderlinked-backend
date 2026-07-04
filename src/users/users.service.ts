import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
      
      let uniqueSubdomain = username;
      if (!uniqueSubdomain) {
        // Generate a 6-character random alphanumeric subdomain fallback
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        uniqueSubdomain = '';
        for (let i = 0; i < 6; i++) {
            uniqueSubdomain += chars.charAt(Math.floor(Math.random() * chars.length));
        }
      }

      const tenant = await this.prisma.tenant.create({
        data: {
          name: tenantName,
          subdomain: uniqueSubdomain,
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

      return profile;
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
        const tenantName = `Workspace_${userId.substring(0, 5)}`;
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let uniqueSubdomain = '';
        for (let i = 0; i < 6; i++) {
            uniqueSubdomain += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        const tenant = await this.prisma.tenant.create({
          data: { name: tenantName, subdomain: uniqueSubdomain },
        });

        await this.prisma.tenantMember.create({
          data: { userId, tenantId: tenant.id, role: 'OWNER' },
        });
      }

      // Re-fetch member after creation
      member = await this.prisma.tenantMember.findFirst({
        where: { userId },
        include: { 
          tenant: {
            include: { subscription: true }
          }
        }
      });
    }

    return {
      ...profile,
      tenant: member?.tenant || null,
    };
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
