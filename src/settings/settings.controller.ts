import {
  Controller,
  Get,
  Post,
  Body,
  InternalServerErrorException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from "@nestjs/swagger";
import { SettingsService } from "./settings.service";
import { UseGuards } from "@nestjs/common";
import { SuperAdminGuard } from "../auth/guards/super-admin.guard";

@ApiTags("Settings")
@ApiBearerAuth()
@Controller("settings")
@UseGuards(SuperAdminGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: "Get system settings (scrape interval)" })
  async getSettings() {
    try {
      return await this.settingsService.getSettings();
    } catch (error: any) {
      console.error("[GET /settings] Error:", error);
      throw new InternalServerErrorException("Failed to fetch settings");
    }
  }

  @Post()
  @ApiOperation({ summary: "Update system settings" })
  @ApiBody({ schema: { properties: { scrapeIntervalHours: { type: "number", description: "Interval in hours between scrapes" } } } })
  async updateSettings(@Body() body: { scrapeIntervalHours?: number }) {
    try {
      return await this.settingsService.updateSettings(body);
    } catch (error: any) {
      console.error("[POST /settings] Error:", error);
      throw new InternalServerErrorException("Failed to update settings");
    }
  }
}
