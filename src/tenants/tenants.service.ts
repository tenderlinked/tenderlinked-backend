import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantRole } from '@prisma/client';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  // ---- Tenant Admin Actions ----

  async getTenantMembers(tenantId: string) {
    const members = await this.prisma.tenantMember.findMany({
      where: { tenantId },
      include: { customRole: true }
    });

    const userIds = members.map(m => m.userId);
    const profiles = await this.prisma.userProfile.findMany({
      where: { userId: { in: userIds } }
    });

    const profileMap = new Map(profiles.map(p => [p.userId, p]));

    return members.map(member => ({
      ...member,
      userProfile: profileMap.get(member.userId) || null,
      customRole: (member as any).customRole || null
    }));
  }

  async addMember(tenantId: string, email: string, roleId?: string, password?: string, firstName?: string, lastName?: string) {
    let profile = await this.prisma.userProfile.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } }
    });

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException("Tenant not found");

    if (!profile) {
      // 1. User doesn't exist, create them in Keycloak
      const tenantLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/login`;
      const newUserId = await this.inviteUserToKeycloak(email, tenantLink, tenant.name, password, firstName, lastName);
      
      if (!newUserId) {
        throw new BadRequestException("Failed to create user in authentication provider.");
      }

      // 2. Create UserProfile
      // @ts-ignore
      profile = await this.prisma.userProfile.create({
        data: {
          userId: newUserId,
          email: email.toLowerCase(),
          globalRole: 'USER'
        }
      });
    }

    let resolvedRoleId = roleId;
    let isOwnerRole = false;

    if (!resolvedRoleId) {
      const defaultUserRole = await this.prisma.role.findFirst({
        where: { isDefaultUser: true, isSystemRole: true }
      });
      resolvedRoleId = defaultUserRole?.id || undefined;
    }

    if (resolvedRoleId) {
      const role = await this.prisma.role.findUnique({ where: { id: resolvedRoleId } });
      if (role && role.name.toLowerCase().includes('owner')) {
        isOwnerRole = true;
      }
    }

    // 3. Upsert TenantMember
    return this.prisma.tenantMember.upsert({
      where: { tenantId_userId: { tenantId, userId: profile.userId } },
      update: { roleId: resolvedRoleId, isOwner: isOwnerRole },
      create: { tenantId, userId: profile.userId, roleId: resolvedRoleId, isOwner: isOwnerRole }
    });
  }

  private generateRandomPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let pass = '';
    for (let i = 0; i < 12; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  }

  private async inviteUserToKeycloak(email: string, tenantLink: string, tenantName: string, password?: string, firstName?: string, lastName?: string): Promise<string | null> {
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
      
      if (!tokenRes.ok) return null;
      
      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;
      
      const urlParts = new URL(issuer);
      const realm = urlParts.pathname.split('/').pop();
      const adminBaseUrl = `${urlParts.origin}/admin/realms/${realm}/users`;
      
      const tempPassword = password || this.generateRandomPassword();

      const emailPrefix = email.split('@')[0];
      const defaultFirstName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);

      const createRes = await fetch(adminBaseUrl, {
        method: 'POST',
        headers: { 
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: email.toLowerCase(),
          email: email.toLowerCase(),
          firstName: firstName || defaultFirstName,
          lastName: lastName || tenantName || 'User',
          enabled: true,
          emailVerified: true,
          credentials: [{
            type: 'password',
            value: tempPassword,
            temporary: password ? false : true
          }]
        })
      });

      if (!createRes.ok) {
        console.error('Failed to create user in Keycloak:', await createRes.text());
        return null;
      }

      const locationHeader = createRes.headers.get('location');
      const newUserId = locationHeader ? locationHeader.split('/').pop() : null;

      // TODO: Use a real mailer service here
      console.log(`
      =========================================================
      [MOCK EMAIL] Invitation sent to: ${email}
      Subject: You've been invited to ${tenantName}
      
      Hello!
      
      You have been invited to join the ${tenantName} workspace on Tender Tracker.
      
      Your Username: ${email}
      Your Temporary Password: ${tempPassword}
      
      Please log in and you will be prompted to reset your password and set your keyword preferences.
      Login Link: ${tenantLink}
      =========================================================
      `);

      return newUserId || null;
    } catch (err) {
      console.error('Error inviting user via Keycloak:', err);
      return null;
    }
  }

  async removeMember(tenantId: string, userId: string) {
    const member = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } }
    });
    if (!member) throw new NotFoundException("Member not found in this tenant");
    
    if (member.isOwner) {
      const ownersCount = await this.prisma.tenantMember.count({
        where: { tenantId, isOwner: true }
      });
      if (ownersCount <= 1) {
        throw new BadRequestException("Cannot remove the last owner of a tenant.");
      }
    }

    return this.prisma.tenantMember.delete({
      where: { tenantId_userId: { tenantId, userId } }
    });
  }

  async updateMemberRole(tenantId: string, userId: string, roleId: string) {
    const member = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } }
    });
    if (!member) throw new NotFoundException("Member not found in this tenant");

    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException("Role not found");

    const isOwnerRole = role.name.toLowerCase().includes('owner');

    if (!isOwnerRole && member.isOwner) {
      // If removing ownership, ensure there's at least one owner left
      const ownersCount = await this.prisma.tenantMember.count({
        where: { tenantId, isOwner: true }
      });
      if (ownersCount <= 1) {
        throw new BadRequestException("Cannot remove the last owner of a tenant. At least one member must be an owner.");
      }
    }

    return this.prisma.tenantMember.update({
      where: { tenantId_userId: { tenantId, userId } },
      data: { 
        roleId,
        isOwner: isOwnerRole
      }
    });
  }

  async toggleOwnerStatus(tenantId: string, userId: string, isOwner: boolean) {
    const member = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } }
    });
    if (!member) throw new NotFoundException("Member not found in this tenant");

    // If removing ownership, ensure there's at least one owner left
    if (!isOwner && member.isOwner) {
      const ownersCount = await this.prisma.tenantMember.count({
        where: { tenantId, isOwner: true }
      });
      if (ownersCount <= 1) {
        throw new BadRequestException("Cannot remove the last owner of a tenant. At least one member must be an owner.");
      }
    }

    return this.prisma.tenantMember.update({
      where: { tenantId_userId: { tenantId, userId } },
      data: { isOwner }
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
  async saveAlertPreferencesByTenantId(tenantId: string, data: { keywords: string[], preferredStates: string[], tenderValueRange?: string, companyWebsite?: string }) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId }
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
