import { Controller, Get, Post, Body, Put, Param, Delete, UseGuards } from '@nestjs/common';
import { PlansService } from './plans.service';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Plans')
@Controller('api/plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @UseGuards(SuperAdminGuard)
  @Post()
  @ApiOperation({ summary: 'Create a new subscription plan' })
  create(@Body() createPlanDto: { 
    name: string; 
    price?: number; 
    allowedTenderFields: string[]; 
    isDefault?: boolean;
    monthlyCredits?: number;
    maxKeywords?: number;
    maxStates?: number;
    maxTenderViews?: number;
    hasEmailAlerts?: boolean;
    hasWhatsappAlerts?: boolean;
    hasSmsAlerts?: boolean;
  }) {
    return this.plansService.create(createPlanDto);
  }

  // Public endpoint so frontend can display available plans
  @Get()
  @ApiOperation({ summary: 'Get all subscription plans' })
  findAll() {
    return this.plansService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific plan' })
  findOne(@Param('id') id: string) {
    return this.plansService.findOne(id);
  }

  @UseGuards(SuperAdminGuard)
  @Put(':id')
  @ApiOperation({ summary: 'Update a subscription plan' })
  update(@Param('id') id: string, @Body() updatePlanDto: { 
    name?: string; 
    price?: number; 
    allowedTenderFields?: string[]; 
    isDefault?: boolean;
    monthlyCredits?: number;
    maxKeywords?: number;
    maxStates?: number;
    maxTenderViews?: number;
    hasEmailAlerts?: boolean;
    hasWhatsappAlerts?: boolean;
    hasSmsAlerts?: boolean;
  }) {
    return this.plansService.update(id, updatePlanDto);
  }

  @UseGuards(SuperAdminGuard)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a subscription plan' })
  remove(@Param('id') id: string) {
    return this.plansService.remove(id);
  }
}
