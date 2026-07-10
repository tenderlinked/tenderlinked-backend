import { Controller, Get, Post, Delete, Patch, Param, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
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
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@UseGuards(TenantRoleGuard)
  @RequirePermissions('members:read')
  async getMembers(@Param('tenantId') tenantId: string) {
    return this.tenantsService.getTenantMembers(tenantId);
  }

  @Post(':tenantId/members')
  @ApiOperation({ summary: "Add a member to a tenant workspace" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@UseGuards(TenantRoleGuard)
  @RequirePermissions('members:manage')
  async addMember(@Param('tenantId') tenantId: string, @Body() body: { email: string, roleId?: string, password?: string, firstName?: string, lastName?: string }) {
    return this.tenantsService.addMember(tenantId, body.email, body.roleId, body.password, body.firstName, body.lastName);
  }

  @Patch(':tenantId/members/:userId')
  @ApiOperation({ summary: "Update a member's role" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@UseGuards(TenantRoleGuard)
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
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@UseGuards(TenantRoleGuard)
  @RequirePermissions('members:manage')
  async removeMember(@Param('tenantId') tenantId: string, @Param('userId') userId: string) {
    return this.tenantsService.removeMember(tenantId, userId);
  }

  @Post(':tenantId/alert-preferences')
  @ApiOperation({ summary: "Save email alert preferences for a tenant" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@UseGuards(TenantRoleGuard)
  @RequirePermissions('settings:manage')
  async saveAlertPreferences(
    @Param('tenantId') tenantId: string, 
    @Body() body: { keywords: string[], preferredStates: string[], tenderValueRange?: string, companyWebsite?: string }
  ) {
    return this.tenantsService.saveAlertPreferencesByTenantId(tenantId, body);
  }

  // ---- Super Admin Routes (Should use a SuperAdmin guard ideally) ----
  @Get()
  @ApiOperation({ summary: "Get all tenants (Super Admin)" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@UseGuards(SuperAdminGuard)
  async getAllTenants() {
    return this.tenantsService.getAllTenants();
  }

  @Post(':tenantId/subscription')
  @ApiOperation({ summary: "Update tenant subscription (Super Admin)" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@UseGuards(SuperAdminGuard)
  async updateSubscription(
    @Param('tenantId') tenantId: string, 
    @Body() body: { planType: string; status: string }
  ) {
    return this.tenantsService.updateTenantSubscription(tenantId, body.planType, body.status);
  }

  @Get(':tenantId/admin/members')
  @ApiOperation({ summary: "Get all members of a tenant workspace (Super Admin)" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@UseGuards(SuperAdminGuard)
  async getMembersAdmin(@Param('tenantId') tenantId: string) {
    return this.tenantsService.getTenantMembers(tenantId);
  }

  @Delete(':tenantId/admin/members/:userId')
  @ApiOperation({ summary: "Force remove a member from a tenant (Super Admin)" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@UseGuards(SuperAdminGuard)
  async removeMemberAdmin(@Param('tenantId') tenantId: string, @Param('userId') userId: string) {
    return this.tenantsService.removeMember(tenantId, userId);
  }

  @Post(':tenantId/admin/members/:userId/owner')
  @ApiOperation({ summary: "Toggle owner status of a member (Super Admin)" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@UseGuards(SuperAdminGuard)
  @ApiBody({ schema: { properties: { isOwner: { type: "boolean" } } } })
  async toggleOwnerAdmin(@Param('tenantId') tenantId: string, @Param('userId') userId: string, @Body() body: { isOwner: boolean }) {
    return this.tenantsService.toggleOwnerStatus(tenantId, userId, body.isOwner);
  }

  @Post('bulk-delete')
  @ApiOperation({ summary: "Permanently delete multiple tenant workspaces (Super Admin)" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@UseGuards(SuperAdminGuard)
  @ApiBody({ schema: { properties: { ids: { type: "array", items: { type: "string" } } } } })
  async bulkDeleteTenants(@Body() body: { ids: string[] }) {
    return this.tenantsService.bulkDeleteTenants(body.ids);
  }

  @Delete(':tenantId')
  @ApiOperation({ summary: "Permanently delete a tenant workspace and all its data (Super Admin)" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@UseGuards(SuperAdminGuard)
  async deleteTenant(@Param('tenantId') tenantId: string) {
    return this.tenantsService.deleteTenant(tenantId);
  }
}
