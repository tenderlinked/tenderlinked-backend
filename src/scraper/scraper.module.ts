import { Module } from "@nestjs/common";
import { ScraperService } from "./scraper.service";
import { ScraperController } from "./scraper.controller";
import { ScraperTargetsService } from "./scraper-targets.service";
import { ScraperTargetsController } from "./scraper-targets.controller";

@Module({
  controllers: [ScraperController, ScraperTargetsController],
  providers: [ScraperService, ScraperTargetsService],
  exports: [ScraperService],
})
export class ScraperModule {}
