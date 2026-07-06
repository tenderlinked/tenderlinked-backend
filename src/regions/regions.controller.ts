import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { RegionsService } from './regions.service';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';

@Controller('regions')
export class RegionsController {
  constructor(private readonly regionsService: RegionsService) {}

  @Get('states')
  getAllStates() {
    return this.regionsService.getAllStates();
  }

  @Post('states')
  @UseGuards(SuperAdminGuard)
  createState(@Body() data: { name: string }) {
    return this.regionsService.createState(data.name);
  }

  @Patch('states/:id')
  @UseGuards(SuperAdminGuard)
  updateState(@Param('id') id: string, @Body() data: { name: string }) {
    return this.regionsService.updateState(id, data.name);
  }

  @Delete('states/:id')
  @UseGuards(SuperAdminGuard)
  deleteState(@Param('id') id: string) {
    return this.regionsService.deleteState(id);
  }

  @Post('states/:id/districts')
  @UseGuards(SuperAdminGuard)
  createDistrict(@Param('id') stateId: string, @Body() data: { name: string }) {
    return this.regionsService.createDistrict(stateId, data.name);
  }

  @Patch('districts/:id')
  @UseGuards(SuperAdminGuard)
  updateDistrict(@Param('id') id: string, @Body() data: { name: string }) {
    return this.regionsService.updateDistrict(id, data.name);
  }

  @Delete('districts/:id')
  @UseGuards(SuperAdminGuard)
  deleteDistrict(@Param('id') id: string) {
    return this.regionsService.deleteDistrict(id);
  }
}
