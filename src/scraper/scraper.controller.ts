import {
  Controller,
  Post,
  Req,
  Body,
  UnauthorizedException,
  BadRequestException,
  HttpCode,
} from "@nestjs/common";
import type { Request } from "express";
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from "@nestjs/swagger";
import { ScraperService } from "./scraper.service";
import { DISTRICTS } from "./districts";

@ApiTags("Scraper")
@Controller("scrape")
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: "Trigger manual scrape" })
  @ApiBearerAuth("cron-secret")
  @ApiBody({ schema: { properties: { district: { type: "string", description: "Optional district name or 'state'" } } } })
  async scrape(
    @Req() req: Request,
    @Body() body: { district?: string } = {}
  ) {
    // Basic authentication: requires either a frontend 'auth' cookie or a valid CRON_SECRET header
    const authCookie = req.cookies?.["auth"] || req.cookies?.["next-auth.session-token"] || req.cookies?.["__Secure-next-auth.session-token"];
    const authHeader = req.headers["authorization"];
    const cronSecret = process.env.CRON_SECRET;

    const isFrontendUser = !!authCookie;
    const isCronJob = cronSecret && authHeader === `Bearer ${cronSecret}`;

    if (!isFrontendUser && !isCronJob) {
      throw new UnauthorizedException("Unauthorized");
    }

    const source = isFrontendUser ? "MANUAL" : "AUTO";

    let targetDistrict: string | null = null;

    if (body?.district) {
      if (body.district.toLowerCase() === "state") {
        targetDistrict = "state";
      } else if (!DISTRICTS.includes(body.district.toLowerCase())) {
        throw new BadRequestException(
          `Invalid district name. Allowed values: ${DISTRICTS.join(", ")}`
        );
      } else {
        targetDistrict = body.district.toLowerCase();
      }
    }

    if (targetDistrict === "state") {
      const result = await this.scraperService.scrapeStateTenders(source);
      return {
        success: result.success,
        districtsProcessed: 1,
        newTenders: result.newTendersCount || 0,
        details: [result],
      };
    } else if (targetDistrict) {
      const result = await this.scraperService.scrapeDistrict(targetDistrict, source);
      return {
        success: result.success,
        districtsProcessed: 1,
        newTenders: result.newTendersCount || 0,
        details: [result],
      };
    } else {
      const result = await this.scraperService.runFullScrape(source);
      const newTenders = result.results.reduce(
        (acc, curr) => acc + (curr.newTendersCount || 0),
        0
      );
      return {
        success: true,
        districtsProcessed: result.districtsProcessed,
        newTenders,
        details: result.results,
      };
    }
  }

  @Post("stop")
  @HttpCode(200)
  @ApiOperation({ summary: "Stop any manual scrape" })
  @ApiBearerAuth("cron-secret")
  stopScrape() {
    this.scraperService.stopScrape();
    return { success: true, message: "Scraping stopped" };
  }
}
