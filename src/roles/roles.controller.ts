import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { TenantRoleGuard } from '../auth/guards/tenant-role.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('system')
  @ApiOperation({ summary: "Get all system roles (Super Admin only)" })
  @UseGuards(SuperAdminGuard)
  async getSystemRoles() {
    return this.rolesService.getSystemRoles();
  }

  @Post('system')
  @ApiOperation({ summary: "Create a system role (Super Admin only)" })
  @UseGuards(SuperAdminGuard)
  async createSystemRole(@Body() body: { name: string, description?: string, permissions: string[], isDefaultAdmin?: boolean, isDefaultUser?: boolean }) {
    return this.rolesService.createSystemRole(body);
  }

  @Post('system/bulk-delete')
  @ApiOperation({ summary: "Bulk delete system roles (Super Admin only)" })
  @UseGuards(SuperAdminGuard)
  async bulkDeleteSystemRoles(@Body() body: { ids: string[] }) {
    try {
      return await this.rolesService.bulkDeleteSystemRoles(body.ids);
    } catch (e: any) {
      if (e.message.includes("assigned")) {
        throw new Error("Cannot delete roles: one or more are assigned to users.");
      }
      throw e;
    }
  }

  @Put('system/:roleId')
  @ApiOperation({ summary: "Update a system role (Super Admin only)" })
  @UseGuards(SuperAdminGuard)
  async updateSystemRole(
    @Param('roleId') roleId: string,
    @Body() body: { name?: string, description?: string, permissions?: string[], isDefaultAdmin?: boolean, isDefaultUser?: boolean }
  ) {
    return this.rolesService.updateSystemRole(roleId, body);
  }

  @Delete('system/:roleId')
  @ApiOperation({ summary: "Delete a system role (Super Admin only)" })
  @UseGuards(SuperAdminGuard)
  async deleteSystemRole(@Param('roleId') roleId: string) {
    try {
      return await this.rolesService.deleteSystemRole(roleId);
    } catch (e: any) {
      if (e.message.includes("assigned")) {
        throw new Error("Cannot delete role: it is assigned to users.");
      }
      throw e;
    }
  }
}

@ApiTags('Tenants')
@Controller('tenants')
export class TenantRolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get(':tenantId/roles')
  @ApiOperation({ summary: "Get all available roles for a tenant" })
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('roles:manage')
  async getTenantRoles(@Param('tenantId') tenantId: string) {
    return this.rolesService.getTenantRoles(tenantId);
  }

  @Post(':tenantId/roles')
  @ApiOperation({ summary: "Create a custom role in a tenant" })
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('roles:manage')
  async createTenantRole(
    @Param('tenantId') tenantId: string,
    @Body() body: { name: string, description?: string, permissions: string[] }
  ) {
    return this.rolesService.createTenantRole(tenantId, body);
  }

  @Put(':tenantId/roles/:roleId')
  @ApiOperation({ summary: "Update a custom role" })
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('roles:manage')
  async updateTenantRole(
    @Param('tenantId') tenantId: string,
    @Param('roleId') roleId: string,
    @Body() body: { name?: string, description?: string, permissions?: string[] }
  ) {
    return this.rolesService.updateTenantRole(tenantId, roleId, body);
  }

  @Delete(':tenantId/roles/:roleId')
  @ApiOperation({ summary: "Delete a custom role" })
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('roles:manage')
  async deleteTenantRole(
    @Param('tenantId') tenantId: string,
    @Param('roleId') roleId: string
  ) {
    return this.rolesService.deleteTenantRole(tenantId, roleId);
  }
}
