import { Controller, Get, Post, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { TenantRoleGuard } from '../auth/guards/tenant-role.guard';

@ApiTags('Tenants')
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  // ---- Tenant Admin Routes ----
  @Get(':tenantId/members')
  @ApiOperation({ summary: "Get all members of a tenant workspace" })
  @UseGuards(TenantRoleGuard)
  async getMembers(@Param('tenantId') tenantId: string) {
    return this.tenantsService.getTenantMembers(tenantId);
  }

  @Delete(':tenantId/members/:userId')
  @ApiOperation({ summary: "Remove a member from a tenant" })
  @UseGuards(TenantRoleGuard)
  async removeMember(@Param('tenantId') tenantId: string, @Param('userId') userId: string) {
    return this.tenantsService.removeMember(tenantId, userId);
  }

  @Post(':tenantId/subdomain')
  @ApiOperation({ summary: "Update the subdomain for a tenant" })
  @UseGuards(TenantRoleGuard)
  async updateSubdomain(@Param('tenantId') tenantId: string, @Body() body: { subdomain: string }) {
    return this.tenantsService.updateSubdomain(tenantId, body.subdomain);
  }

  @Post('by-subdomain/:subdomain/alert-preferences')
  @ApiOperation({ summary: "Save email alert preferences for a tenant by subdomain" })
  // Public endpoint for the onboarding step right after registration
  async saveAlertPreferences(
    @Param('subdomain') subdomain: string, 
    @Body() body: { keywords: string[], preferredStates: string[], tenderValueRange?: string, companyWebsite?: string }
  ) {
    return this.tenantsService.saveAlertPreferencesBySubdomain(subdomain, body);
  }

  // ---- Super Admin Routes (Should use a SuperAdmin guard ideally) ----
  @Get()
  @ApiOperation({ summary: "Get all tenants (Super Admin)" })
  // @UseGuards(SuperAdminGuard) // TODO
  async getAllTenants() {
    return this.tenantsService.getAllTenants();
  }

  @Post(':tenantId/subscription')
  @ApiOperation({ summary: "Update tenant subscription (Super Admin)" })
  // @UseGuards(SuperAdminGuard) // TODO
  async updateSubscription(
    @Param('tenantId') tenantId: string, 
    @Body() body: { planType: string; status: string }
  ) {
    return this.tenantsService.updateTenantSubscription(tenantId, body.planType, body.status);
  }
}
