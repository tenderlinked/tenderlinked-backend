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

  async inviteMember(tenantId: string, email: string, role: string = 'USER') {
    // Basic implementation: Since we only have users in Keycloak right now,
    // we would ideally send an email. For now, we'll just check if they have a profile,
    // and if so, add them to the tenant. Otherwise return an error saying they must sign up first.
    // A robust system uses an Invitation model, but we'll keep it simple for the SaaS template.

    // Let's pretend we look up their userId by email (this requires Keycloak integration in reality)
    // For this boilerplate, we'll assume the client passes the exact user ID, OR we just 
    // find a user profile that matches the email (if we added email to profile).
    // Let's just create an invitation record (we don't have an Invitation model in schema).
    // So we'll throw a feature-not-complete error with instructions.
    
    throw new BadRequestException("Invitation system requires email service integration. (SaaS feature stub)");
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
        provider: 'MANUAL',
        providerSubId: 'MANUAL_' + Date.now(),
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(new Date().setFullYear(new Date().getFullYear() + 10)) // Arbitrary far future for manual
      }
    });
  }

  async deleteTenant(tenantId: string) {
    // Delete associated records first (cascade should ideally handle this if set in schema, 
    // but Prisma sometimes requires explicit deletes or onUpdate Cascade setup)
    await this.prisma.tenantMember.deleteMany({ where: { tenantId } });
    await this.prisma.tenantSubscription.deleteMany({ where: { tenantId } });
    await this.prisma.tenantAlertPreference.deleteMany({ where: { tenantId } });
    // Assuming there might be tenders associated with the tenant in a real app,
    // they would be deleted here too if they are tenant-specific.
    
    return this.prisma.tenant.delete({
      where: { id: tenantId }
    });
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
