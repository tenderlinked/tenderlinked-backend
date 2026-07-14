import { Controller, Get, Post, Body, Put, Param, Delete, UseGuards } from '@nestjs/common';
import { PlansService } from './plans.service';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @UseGuards(SuperAdminGuard)
  @Post()
  @ApiOperation({ summary: 'Create a new subscription plan' })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })create(@Body() createPlanDto: { 
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
    freeRedownloads?: number;
  }) {
    return this.plansService.create(createPlanDto);
  }

  // Public endpoint so frontend can display available plans
  @Get()
  @ApiOperation({ summary: 'Get all subscription plans' })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })findAll() {
    return this.plansService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific plan' })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })findOne(@Param('id') id: string) {
    return this.plansService.findOne(id);
  }

  @UseGuards(SuperAdminGuard)
  @Put(':id')
  @ApiOperation({ summary: 'Update a subscription plan' })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })update(@Param('id') id: string, @Body() updatePlanDto: { 
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
    freeRedownloads?: number;
  }) {
    return this.plansService.update(id, updatePlanDto);
  }

  @UseGuards(SuperAdminGuard)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a subscription plan' })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })remove(@Param('id') id: string) {
    return this.plansService.remove(id);
  }
}
