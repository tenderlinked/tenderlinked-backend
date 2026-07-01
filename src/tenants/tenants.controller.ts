import { Controller, Get, Post, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantRoleGuard } from '../auth/guards/tenant-role.guard';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  // ---- Tenant Admin Routes ----
  @Get(':tenantId/members')
  @UseGuards(TenantRoleGuard)
  async getMembers(@Param('tenantId') tenantId: string) {
    return this.tenantsService.getTenantMembers(tenantId);
  }

  @Delete(':tenantId/members/:userId')
  @UseGuards(TenantRoleGuard)
  async removeMember(@Param('tenantId') tenantId: string, @Param('userId') userId: string) {
    return this.tenantsService.removeMember(tenantId, userId);
  }

  @Post(':tenantId/subdomain')
  @UseGuards(TenantRoleGuard)
  async updateSubdomain(@Param('tenantId') tenantId: string, @Body() body: { subdomain: string }) {
    return this.tenantsService.updateSubdomain(tenantId, body.subdomain);
  }

  // ---- Super Admin Routes (Should use a SuperAdmin guard ideally) ----
  @Get()
  // @UseGuards(SuperAdminGuard) // TODO
  async getAllTenants() {
    return this.tenantsService.getAllTenants();
  }

  @Post(':tenantId/subscription')
  // @UseGuards(SuperAdminGuard) // TODO
  async updateSubscription(
    @Param('tenantId') tenantId: string, 
    @Body() body: { planType: string; status: string }
  ) {
    return this.tenantsService.updateTenantSubscription(tenantId, body.planType, body.status);
  }
}
