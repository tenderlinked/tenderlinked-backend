import {
  Controller,
  Post,
  Get,
  Req,
  Body,
  Param,
  BadRequestException,
  HttpCode,
  UseGuards,
} from "@nestjs/common";
import { ScrapeStatus } from "./types";
import type { Request } from "express";
import { ApiTags, ApiOperation, ApiBody, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ScraperService } from "./scraper.service";
import { TenantRoleGuard } from "../auth/guards/tenant-role.guard";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { lookupPincode } from "./utils";

@ApiTags("Scraper")
@Controller("scrape")
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: "Trigger manual scrape" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@UseGuards(TenantRoleGuard)
  @RequirePermissions("tenders:scrape")
  @ApiBody({ schema: { properties: { 
    targetIds: { type: "array", items: { type: "string" }, description: "Optional array of target IDs" },
    aiMode: { type: "string", enum: ["local-nlp", "openai-mini", "openai-4o"], description: "AI processing mode: local-nlp (free), openai-mini (cheap), openai-4o (best quality)", default: "openai-mini" }
  } } })
  async scrape(
    @Req() req: Request,
    @Body() body: { targetIds?: string[]; aiMode?: string; repairDocuments?: boolean } = {}
  ) {
    const authHeader = req.headers["authorization"];
    const cronSecret = process.env.CRON_SECRET;
    const isCronJob = !!(cronSecret && authHeader === `Bearer ${cronSecret}`);
    const source = isCronJob ? "AUTO" : "MANUAL";

    // Store aiMode in DB so boq.processor can read it for this scrape session
    let currentAiMode = 'openai-mini';
    if (body?.aiMode) {
      currentAiMode = body.aiMode;
      await this.scraperService['prisma'].systemSetting.upsert({
        where: { key: 'ACTIVE_AI_MODE' },
        update: { value: currentAiMode },
        create: { key: 'ACTIVE_AI_MODE', value: currentAiMode }
      });
    } else {
      const dbMode = await this.scraperService['prisma'].systemSetting.findUnique({
        where: { key: 'ACTIVE_AI_MODE' }
      });
      if (dbMode) currentAiMode = dbMode.value;
    }

    if (body?.targetIds && body.targetIds.length > 0) {
      const result = await this.scraperService.scrapeSpecificTargets(body.targetIds, source, body.repairDocuments);
      return {
        success: true,
        message: `Scraper started in background (AI mode: ${currentAiMode})`,
        aiMode: currentAiMode,
        districtsProcessed: result.districtsProcessed,
      };
    } else {
      const result = await this.scraperService.runFullScrape(source, body.repairDocuments);
      return {
        success: true,
        message: `Scraper started in background (AI mode: ${currentAiMode})`,
        aiMode: currentAiMode,
        districtsProcessed: result.districtsProcessed,
      };
    }
  }

  @Post("stop")
  @HttpCode(200)
  @ApiOperation({ summary: "Stop all current scrape operations" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@UseGuards(TenantRoleGuard)
  @RequirePermissions("tenders:scrape")
  async stopScrape(@Req() req: Request) {
    this.scraperService.stopScrape();
    return { success: true, message: "All scraping stopped" };
  }

  @Get("instances")
  @ApiOperation({ summary: "Get all active scraper instances" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@UseGuards(TenantRoleGuard)
  @RequirePermissions("tenders:scrape")
  async getInstances() {
    return await this.scraperService.getInstances();
  }

  @Post("instances/:id/status")
  @HttpCode(200)
  @ApiOperation({ summary: "Update status of a specific instance" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@UseGuards(TenantRoleGuard)
  @RequirePermissions("tenders:scrape")
  async updateInstanceStatus(
    @Param("id") id: string,
    @Body() body: { status: ScrapeStatus }
  ) {
    await this.scraperService.updateInstanceStatus(id, body.status);
    return { success: true };
  }

  @Get("pincode/:pincode")
  @ApiOperation({ summary: "Lookup Indian Pincode details" })
  @ApiParam({ name: "pincode", description: "6 digit Indian pincode (e.g. 400070)", type: "string" })
  @ApiResponse({ status: 200, description: 'Returns array of matching post offices' })
  async checkPincode(@Param("pincode") pincode: string) {
    if (!pincode || pincode.length !== 6) {
      throw new BadRequestException("Pincode must be exactly 6 digits");
    }
    const results = lookupPincode(pincode);
    if (!results || results.length === 0) {
      return { success: false, message: "No data found for this pincode", data: [] };
    }
    return { success: true, data: results };
  }
}
