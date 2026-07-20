import {
  Controller,
  Get,
  Post,
  Body,
  InternalServerErrorException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { SettingsService } from "./settings.service";
import { UseGuards } from "@nestjs/common";
import { SuperAdminGuard } from "../auth/guards/super-admin.guard";

@ApiTags("Settings")
@Controller("settings")
@UseGuards(SuperAdminGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: "Get system settings (scrape interval)" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })async getSettings() {
    try {
      return await this.settingsService.getSettings();
    } catch (error: any) {
      console.error("[GET /settings] Error:", error);
      throw new InternalServerErrorException("Failed to fetch settings");
    }
  }

  @Post()
  @ApiOperation({ summary: "Update system settings" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@ApiBody({ schema: { properties: { scrapeIntervalHours: { type: "number", description: "Interval in hours between scrapes" }, smsProvider: { type: "string", description: "SMS provider (MSG91 or TWILIO)", enum: ["MSG91", "TWILIO"] }, aiMode: { type: "string", description: "AI Processing Mode", enum: ["local-nlp", "openai-mini", "openai-4o"] } } } })
  async updateSettings(@Body() body: { scrapeIntervalHours?: number; smsProvider?: string; aiMode?: string }) {
    try {
      return await this.settingsService.updateSettings(body);
    } catch (error: any) {
      console.error("[POST /settings] Error:", error);
      throw new InternalServerErrorException("Failed to update settings");
    }
  }
}
