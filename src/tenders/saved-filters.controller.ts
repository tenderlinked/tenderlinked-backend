import { Controller, Get, Post, Delete, Param, Body, UseGuards, Req, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SavedFiltersService } from './saved-filters.service';
import { TenantRoleGuard } from '../auth/guards/tenant-role.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags("Saved Filters")
@Controller("saved-filters")
export class SavedFiltersController {
  constructor(
    private readonly savedFiltersService: SavedFiltersService,
    private readonly prisma: PrismaService
  ) {}

  private async getUserIdAndTenantId(req: any) {
    let userId: string | null = null;
    const authHeader = req?.headers?.['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const payloadBase64 = token.split('.')[1];
        const decodedPayload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
        userId = decodedPayload.sub;
      } catch (e) {
        // Ignore
      }
    }

    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }

    const member = await this.prisma.tenantMember.findFirst({
      where: { userId },
      select: { tenantId: true }
    });

    if (!member) {
      throw new UnauthorizedException("User does not belong to a workspace");
    }

    return { userId, tenantId: member.tenantId };
  }

  @Post()
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('tenders:read')
  @ApiOperation({ summary: "Create a new saved filter" })
  @ApiResponse({ status: 201, description: 'Saved successfully' })
  async createFilter(@Req() req: any, @Body() body: { name: string, filters: any }) {
    if (!body.name || !body.filters) {
      throw new BadRequestException("Name and filters are required");
    }
    const { userId, tenantId } = await this.getUserIdAndTenantId(req);
    return this.savedFiltersService.createSavedFilter(tenantId, userId, body.name, body.filters);
  }

  @Get()
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('tenders:read')
  @ApiOperation({ summary: "Get all saved filters for the user" })
  @ApiResponse({ status: 200, description: 'List of filters' })
  async getFilters(@Req() req: any) {
    const { userId, tenantId } = await this.getUserIdAndTenantId(req);
    return this.savedFiltersService.getSavedFilters(tenantId, userId);
  }

  @Delete(':id')
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('tenders:read')
  @ApiOperation({ summary: "Delete a saved filter" })
  @ApiResponse({ status: 200, description: 'Deleted successfully' })
  async deleteFilter(@Req() req: any, @Param('id') id: string) {
    const { userId, tenantId } = await this.getUserIdAndTenantId(req);
    return this.savedFiltersService.deleteSavedFilter(id, tenantId, userId);
  }
}
