import { Module } from "@nestjs/common";
import { QueueService } from "./queue.service";
import { QueueController } from "./queue.controller";
import { EmailModule } from "../email/email.module";
import { ScraperModule } from "../scraper/scraper.module";

@Module({
  imports: [EmailModule, ScraperModule],
  controllers: [QueueController],
  providers: [QueueService],
})
export class QueueModule {}
