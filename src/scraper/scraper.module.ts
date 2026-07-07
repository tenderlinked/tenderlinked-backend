import { Module } from "@nestjs/common";
import { ScraperService } from "./scraper.service";
import { ScraperController } from "./scraper.controller";
import { ScraperTargetsService } from "./scraper-targets.service";
import { ScraperTargetsController } from "./scraper-targets.controller";
import { SessionService } from "./session.service";

@Module({
  controllers: [ScraperController, ScraperTargetsController],
  providers: [ScraperService, ScraperTargetsService, SessionService],
  exports: [ScraperService, SessionService],
})
export class ScraperModule {}
