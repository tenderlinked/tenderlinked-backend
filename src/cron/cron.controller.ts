import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
  InternalServerErrorException,
} from "@nestjs/common";
import type { Request } from "express";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { CronService } from "./cron.service";

@ApiTags("Cron")
@Controller("cron")
export class CronController {
  constructor(private readonly cronService: CronService) {}

  @Get("status")
  @ApiOperation({ summary: "Check cron status to see if scrape should run" })
  @ApiBearerAuth("cron-secret")
  async getStatus(@Req() req: Request) {
    const authHeader = req.headers["authorization"];
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      throw new UnauthorizedException("Unauthorized");
    }

    try {
      return await this.cronService.getStatus();
    } catch (error: any) {
      console.error("[GET /cron/status] Error:", error);
      throw new InternalServerErrorException("Failed to check cron status");
    }
  }
}
