import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  // ---- Tenant Admin Actions ----

  async getTenantMembers(tenantId: string) {
    const members = await this.prisma.tenantMember.findMany({
      where: { tenantId }
    });

    const userIds = members.map(m => m.userId);
    const profiles = await this.prisma.userProfile.findMany({
      where: { userId: { in: userIds } }
    });

    const profileMap = new Map(profiles.map(p => [p.userId, p]));

    return members.map(member => ({
      ...member,
      userProfile: profileMap.get(member.userId) || null
    }));
  }

  async addMember(tenantId: string, email: string, role: any) {
    const profile = await this.prisma.userProfile.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } }
    });

    if (!profile) {
      throw new NotFoundException("User not found. Please ask them to register first.");
    }

    return this.prisma.tenantMember.upsert({
      where: { tenantId_userId: { tenantId, userId: profile.userId } },
      update: { role },
      create: { tenantId, userId: profile.userId, role }
    });
  }

  async removeMember(tenantId: string, userId: string) {
    const member = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } }
    });
    if (!member) throw new NotFoundException("Member not found in this tenant");
    
    if (member.role === 'OWNER') {
      const ownersCount = await this.prisma.tenantMember.count({
        where: { tenantId, role: 'OWNER' }
      });
      if (ownersCount <= 1) {
        throw new BadRequestException("Cannot remove the last owner of a tenant.");
      }
    }

    return this.prisma.tenantMember.delete({
      where: { tenantId_userId: { tenantId, userId } }
    });
  }

  async updateSubdomain(tenantId: string, newSubdomain: string) {
    const cleanSubdomain = newSubdomain.toLowerCase().replace(/[^a-z0-9-]/g, '');
    
    if (cleanSubdomain.length < 3) {
      throw new BadRequestException("Subdomain must be at least 3 characters");
    }

    // Check if taken
    const existing = await this.prisma.tenant.findUnique({
      where: { subdomain: cleanSubdomain }
    });
    
    if (existing && existing.id !== tenantId) {
      throw new BadRequestException("This subdomain is already taken.");
    }

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { subdomain: cleanSubdomain }
    });
  }

  // ---- Super Admin Actions ----

  async getAllTenants() {
    const tenants = await this.prisma.tenant.findMany({
      include: {
        subscription: true,
        _count: {
          select: { members: true }
        },
        members: {
          where: { role: 'OWNER' },
          take: 1
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const ownerUserIds = tenants.map(t => t.members[0]?.userId).filter(Boolean);
    const profiles = await this.prisma.userProfile.findMany({
      where: { userId: { in: ownerUserIds } }
    });
    const profileMap = new Map(profiles.map(p => [p.userId, p]));

    return tenants.map(t => {
      const ownerId = t.members[0]?.userId;
      const profile = ownerId ? profileMap.get(ownerId) : null;
      // Exclude members from final payload to keep it clean
      const { members, ...tenantData } = t;
      return {
        ...tenantData,
        ownerEmail: (profile as any)?.email || null
      };
    });
  }

  async updateTenantSubscription(tenantId: string, planType: string, status: string) {
    return this.prisma.tenantSubscription.upsert({
      where: { tenantId },
      update: { planType, status },
      create: {
        tenantId,
        planType,
        status,
        paymentMethod: 'MANUAL',
        paymentId: 'MANUAL_' + Date.now(),
        startDate: new Date(),
        endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 10)) // Arbitrary far future for manual
      }
    });
  }

  async deleteTenant(tenantId: string) {
    // 1. Get all members to delete their users entirely
    const members = await this.prisma.tenantMember.findMany({ where: { tenantId } });
    const userIds = members.map(m => m.userId);
    
    // 2. Delete from Keycloak
    await this.deleteUsersFromKeycloak(userIds);
    
    // 3. Delete from UserProfile
    if (userIds.length > 0) {
      await this.prisma.userProfile.deleteMany({ where: { userId: { in: userIds } } });
    }

    // 4. Delete associated records
    await this.prisma.tenantMember.deleteMany({ where: { tenantId } });
    await this.prisma.tenantSubscription.deleteMany({ where: { tenantId } });
    await this.prisma.tenantAlertPreference.deleteMany({ where: { tenantId } });
    
    return this.prisma.tenant.delete({
      where: { id: tenantId }
    });
  }

  async bulkDeleteTenants(tenantIds: string[]) {
    // 1. Get all members to delete their users entirely
    const members = await this.prisma.tenantMember.findMany({ where: { tenantId: { in: tenantIds } } });
    const userIds = members.map(m => m.userId);
    
    // 2. Delete from Keycloak
    await this.deleteUsersFromKeycloak(userIds);
    
    // 3. Delete from UserProfile
    if (userIds.length > 0) {
      await this.prisma.userProfile.deleteMany({ where: { userId: { in: userIds } } });
    }

    // 4. Delete associated records
    await this.prisma.tenantMember.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await this.prisma.tenantSubscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await this.prisma.tenantAlertPreference.deleteMany({ where: { tenantId: { in: tenantIds } } });
    
    return this.prisma.tenant.deleteMany({
      where: { id: { in: tenantIds } }
    });
  }

  private async deleteUsersFromKeycloak(userIds: string[]) {
    if (userIds.length === 0) return;
    try {
      const issuer = process.env.KEYCLOAK_ISSUER || 'https://auth.enfycon.com/realms/enfycon-tender';
      const tokenUrl = `${issuer}/protocol/openid-connect/token`;
      const clientId = process.env.KEYCLOAK_CLIENT_ID || 'enfycon-tender';
      const secret = process.env.KEYCLOAK_CLIENT_SECRET || '';
      
      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      params.append('client_id', clientId);
      params.append('client_secret', secret);
      
      const tokenRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
      });
      
      if (!tokenRes.ok) {
        console.error('Failed to get Keycloak admin token:', await tokenRes.text());
        return;
      }
      
      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;
      
      const urlParts = new URL(issuer);
      const realm = urlParts.pathname.split('/').pop();
      const adminBaseUrl = `${urlParts.origin}/admin/realms/${realm}/users`;
      
      for (const userId of userIds) {
        const delRes = await fetch(`${adminBaseUrl}/${userId}`, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + accessToken }
        });
        if (!delRes.ok && delRes.status !== 404) {
          console.error(`Failed to delete user ${userId} from Keycloak:`, await delRes.text());
        }
      }
    } catch (err) {
      console.error('Error deleting users from Keycloak:', err);
    }
  }

  // ---- Alert Preferences ----
  async saveAlertPreferencesBySubdomain(subdomain: string, data: { keywords: string[], preferredStates: string[], tenderValueRange?: string, companyWebsite?: string }) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { subdomain }
    });

    if (!tenant) {
      throw new NotFoundException("Tenant not found");
    }

    // Intercept keywords to populate the KeywordExpansion dictionary for Super Admin review
    if (data.keywords && data.keywords.length > 0) {
      for (const kw of data.keywords) {
        // Upsert so we don't overwrite if it already exists (e.g. APPROVED status)
        await this.prisma.keywordExpansion.upsert({
          where: { baseWord: kw },
          update: {},
          create: { baseWord: kw, status: 'PENDING' }
        });
      }
    }

    return this.prisma.tenantAlertPreference.upsert({
      where: { tenantId: tenant.id },
      update: {
        keywords: data.keywords,
        preferredStates: data.preferredStates,
        tenderValueRange: data.tenderValueRange,
        companyWebsite: data.companyWebsite,
      },
      create: {
        tenantId: tenant.id,
        keywords: data.keywords,
        preferredStates: data.preferredStates,
        tenderValueRange: data.tenderValueRange,
        companyWebsite: data.companyWebsite,
      }
    });
  }
}
