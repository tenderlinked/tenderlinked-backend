import { Controller, Get, Post, Delete, Patch, Param, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { TenantRoleGuard } from '../auth/guards/tenant-role.guard';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { TenantRole } from '@prisma/client';

@ApiTags('Tenants')
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  // ---- Tenant Admin Routes ----
  @Get(':tenantId/members')
  @ApiOperation({ summary: "Get all members of a tenant workspace" })
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('members:read')
  async getMembers(@Param('tenantId') tenantId: string) {
    return this.tenantsService.getTenantMembers(tenantId);
  }

  @Post(':tenantId/members')
  @ApiOperation({ summary: "Add a member to a tenant workspace" })
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('members:manage')
  async addMember(@Param('tenantId') tenantId: string, @Body() body: { email: string, roleId?: string }) {
    return this.tenantsService.addMember(tenantId, body.email, body.roleId);
  }

  @Patch(':tenantId/members/:userId')
  @ApiOperation({ summary: "Update a member's role" })
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('members:manage')
  async updateMemberRole(
    @Param('tenantId') tenantId: string, 
    @Param('userId') userId: string, 
    @Body() body: { roleId: string }
  ) {
    return this.tenantsService.updateMemberRole(tenantId, userId, body.roleId);
  }

  @Delete(':tenantId/members/:userId')
  @ApiOperation({ summary: "Remove a member from a tenant" })
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('members:manage')
  async removeMember(@Param('tenantId') tenantId: string, @Param('userId') userId: string) {
    return this.tenantsService.removeMember(tenantId, userId);
  }

  @Post(':tenantId/subdomain')
  @ApiOperation({ summary: "Update the subdomain for a tenant" })
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('settings:manage')
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
  @UseGuards(SuperAdminGuard)
  async getAllTenants() {
    return this.tenantsService.getAllTenants();
  }

  @Post(':tenantId/subscription')
  @ApiOperation({ summary: "Update tenant subscription (Super Admin)" })
  @UseGuards(SuperAdminGuard)
  async updateSubscription(
    @Param('tenantId') tenantId: string, 
    @Body() body: { planType: string; status: string }
  ) {
    return this.tenantsService.updateTenantSubscription(tenantId, body.planType, body.status);
  }

  @Get(':tenantId/admin/members')
  @ApiOperation({ summary: "Get all members of a tenant workspace (Super Admin)" })
  @UseGuards(SuperAdminGuard)
  async getMembersAdmin(@Param('tenantId') tenantId: string) {
    return this.tenantsService.getTenantMembers(tenantId);
  }

  @Delete(':tenantId/admin/members/:userId')
  @ApiOperation({ summary: "Force remove a member from a tenant (Super Admin)" })
  @UseGuards(SuperAdminGuard)
  async removeMemberAdmin(@Param('tenantId') tenantId: string, @Param('userId') userId: string) {
    return this.tenantsService.removeMember(tenantId, userId);
  }

  @Post('bulk-delete')
  @ApiOperation({ summary: "Permanently delete multiple tenant workspaces (Super Admin)" })
  @UseGuards(SuperAdminGuard)
  @ApiBody({ schema: { properties: { ids: { type: "array", items: { type: "string" } } } } })
  async bulkDeleteTenants(@Body() body: { ids: string[] }) {
    return this.tenantsService.bulkDeleteTenants(body.ids);
  }

  @Delete(':tenantId')
  @ApiOperation({ summary: "Permanently delete a tenant workspace and all its data (Super Admin)" })
  @UseGuards(SuperAdminGuard)
  async deleteTenant(@Param('tenantId') tenantId: string) {
    return this.tenantsService.deleteTenant(tenantId);
  }
}
