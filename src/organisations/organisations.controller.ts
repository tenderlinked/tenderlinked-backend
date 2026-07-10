import { Controller, Get, Patch, Param, Body, UseGuards, Query } from '@nestjs/common';
import { OrganisationsService } from './organisations.service';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { TenantRoleGuard } from '../auth/guards/tenant-role.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@ApiTags('Organisations')
@Controller('organisations')
export class OrganisationsController {
  constructor(private readonly organisationsService: OrganisationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all organisation mappings' })
  @ApiQuery({ name: 'isMapped', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Success' })
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('tenders:scrape')
  async getAll(@Query('isMapped') isMapped?: string) {
    let parsedIsMapped: boolean | undefined = undefined;
    if (isMapped === 'true') parsedIsMapped = true;
    if (isMapped === 'false') parsedIsMapped = false;
    return await this.organisationsService.getAllMappings(parsedIsMapped);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an organisation mapping' })
  @ApiResponse({ status: 200, description: 'Success' })
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('tenders:scrape')
  async updateMapping(
    @Param('id') id: string,
    @Body() body: { normalizedName: string }
  ) {
    return await this.organisationsService.updateMapping(id, body.normalizedName);
  }
}
