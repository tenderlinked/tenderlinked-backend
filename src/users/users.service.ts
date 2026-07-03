import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createProfile(userId: string, email?: string, phoneNumber?: string, companyName?: string, username?: string) {
    try {
      // 1. Create the User Profile
      // @ts-ignore
      const profile = await this.prisma.userProfile.create({
        data: {
          userId,
          email,
          phoneNumber,
          companyName,
          // Defaults to globalRole: USER
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

      // 3. Assign the user as the OWNER of this new Tenant
      await this.prisma.tenantMember.create({
        data: {
          userId,
          tenantId: tenant.id,
          role: 'OWNER',
        },
      });

      return profile;
    } catch (error) {
      console.error('Error creating user profile & tenant:', error);
      throw new InternalServerErrorException('Failed to create user profile');
    }
  }

  async getProfile(userId: string, email?: string) {
    let profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    
    // Sync email from Keycloak if missing or outdated
    if (profile && email && (profile as any).email !== email) {
      // @ts-ignore
      profile = await this.prisma.userProfile.update({
        where: { userId },
        data: { email }
      });
    }
    
    let member = await this.prisma.tenantMember.findFirst({
      where: { userId },
      include: { tenant: true }
    });

    // Auto-create profile and tenant if they don't exist (e.g., OAuth login without going through registration form)
    if (!profile || !member) {
      if (!profile) {
        // Try creating profile and tenant
        const newProfile = await this.createProfile(userId);
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
        include: { tenant: true }
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
