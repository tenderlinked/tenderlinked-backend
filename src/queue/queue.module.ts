import { Module } from "@nestjs/common";
import { QueueService } from "./queue.service";
import { QueueController } from "./queue.controller";
import { EmailModule } from "../email/email.module";
import { ScraperModule } from "../scraper/scraper.module";
import { AwsModule } from "../aws/aws.module";
import { BoqProcessorService } from "./boq.processor";

@Module({
  imports: [
    EmailModule, 
    ScraperModule,
    AwsModule,
  ],
  controllers: [QueueController],
  providers: [QueueService, BoqProcessorService],
  exports: [BoqProcessorService],
})
export class QueueModule {}
