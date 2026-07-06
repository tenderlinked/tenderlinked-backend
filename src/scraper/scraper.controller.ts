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
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from "@nestjs/swagger";
import { ScraperService } from "./scraper.service";
import { TenantRoleGuard } from "../auth/guards/tenant-role.guard";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";

@ApiTags("Scraper")
@ApiBearerAuth()
@Controller("scrape")
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: "Trigger manual scrape" })
  @ApiBearerAuth("cron-secret")
  @UseGuards(TenantRoleGuard)
  @RequirePermissions("tenders:scrape")
  @ApiBody({ schema: { properties: { targetIds: { type: "array", items: { type: "string" }, description: "Optional array of target IDs" } } } })
  async scrape(
    @Req() req: Request,
    @Body() body: { targetIds?: string[] } = {}
  ) {
    const authHeader = req.headers["authorization"];
    const cronSecret = process.env.CRON_SECRET;
    const isCronJob = !!(cronSecret && authHeader === `Bearer ${cronSecret}`);
    const source = isCronJob ? "AUTO" : "MANUAL";

    if (body?.targetIds && body.targetIds.length > 0) {
      const result = await this.scraperService.scrapeSpecificTargets(body.targetIds, source);
      return {
        success: true,
        message: "Scraper started in background",
        districtsProcessed: result.districtsProcessed,
      };
    } else {
      const result = await this.scraperService.runFullScrape(source);
      return {
        success: true,
        message: "Scraper started in background",
        districtsProcessed: result.districtsProcessed,
      };
    }
  }

  @Post("stop")
  @HttpCode(200)
  @ApiOperation({ summary: "Stop all current scrape operations" })
  @ApiBearerAuth("cron-secret")
  @UseGuards(TenantRoleGuard)
  @RequirePermissions("tenders:scrape")
  async stopScrape(@Req() req: Request) {
    this.scraperService.stopScrape();
    return { success: true, message: "All scraping stopped" };
  }

  @Get("instances")
  @ApiOperation({ summary: "Get all active scraper instances" })
  @UseGuards(TenantRoleGuard)
  @RequirePermissions("tenders:scrape")
  async getInstances() {
    return await this.scraperService.getInstances();
  }

  @Post("instances/:id/status")
  @HttpCode(200)
  @ApiOperation({ summary: "Update status of a specific instance" })
  @UseGuards(TenantRoleGuard)
  @RequirePermissions("tenders:scrape")
  async updateInstanceStatus(
    @Param("id") id: string,
    @Body() body: { status: ScrapeStatus }
  ) {
    this.scraperService.updateInstanceStatus(id, body.status);
    return { success: true };
  }
}
