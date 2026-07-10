import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { TenantRoleGuard } from '../auth/guards/tenant-role.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@ApiTags('Roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('system')
  @ApiOperation({ summary: "Get all system roles (Super Admin only)" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@UseGuards(SuperAdminGuard)
  async getSystemRoles() {
    return this.rolesService.getSystemRoles();
  }

  @Post('system')
  @ApiOperation({ summary: "Create a system role (Super Admin only)" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@UseGuards(SuperAdminGuard)
  async createSystemRole(@Body() body: { name: string, description?: string, permissions: string[], isDefaultAdmin?: boolean, isDefaultUser?: boolean }) {
    return this.rolesService.createSystemRole(body);
  }

  @Post('system/bulk-delete')
  @ApiOperation({ summary: "Bulk delete system roles (Super Admin only)" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@UseGuards(SuperAdminGuard)
  async bulkDeleteSystemRoles(@Body() body: { ids: string[] }) {
    return await this.rolesService.bulkDeleteSystemRoles(body.ids);
  }

  @Put('system/:roleId')
  @ApiOperation({ summary: "Update a system role (Super Admin only)" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@UseGuards(SuperAdminGuard)
  async updateSystemRole(
    @Param('roleId') roleId: string,
    @Body() body: { name?: string, description?: string, permissions?: string[], isDefaultAdmin?: boolean, isDefaultUser?: boolean }
  ) {
    return this.rolesService.updateSystemRole(roleId, body);
  }

  @Delete('system/:roleId')
  @ApiOperation({ summary: "Delete a system role (Super Admin only)" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@UseGuards(SuperAdminGuard)
  async deleteSystemRole(@Param('roleId') roleId: string) {
    return await this.rolesService.deleteSystemRole(roleId);
  }
}

@ApiTags('Tenants')
@Controller('tenants')
export class TenantRolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get(':tenantId/roles')
  @ApiOperation({ summary: "Get all available roles for a tenant" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@UseGuards(TenantRoleGuard)
  @RequirePermissions('roles:manage')
  async getTenantRoles(@Param('tenantId') tenantId: string) {
    return this.rolesService.getTenantRoles(tenantId);
  }

  @Post(':tenantId/roles')
  @ApiOperation({ summary: "Create a custom role in a tenant" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@UseGuards(TenantRoleGuard)
  @RequirePermissions('roles:manage')
  async createTenantRole(
    @Param('tenantId') tenantId: string,
    @Body() body: { name: string, description?: string, permissions: string[] }
  ) {
    return this.rolesService.createTenantRole(tenantId, body);
  }

  @Put(':tenantId/roles/:roleId')
  @ApiOperation({ summary: "Update a custom role" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@UseGuards(TenantRoleGuard)
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
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@UseGuards(TenantRoleGuard)
  @RequirePermissions('roles:manage')
  async deleteTenantRole(
    @Param('tenantId') tenantId: string,
    @Param('roleId') roleId: string
  ) {
    return this.rolesService.deleteTenantRole(tenantId, roleId);
  }
}
