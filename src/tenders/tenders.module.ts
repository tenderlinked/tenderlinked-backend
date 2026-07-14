import { Module } from "@nestjs/common";
import { TendersService } from "./tenders.service";
import { TendersController } from "./tenders.controller";
import { CreditsModule } from "../credits/credits.module";
import { QueueModule } from "../queue/queue.module";

@Module({
  imports: [
    CreditsModule,
    QueueModule
  ],
  controllers: [TendersController],
  providers: [TendersService],
})
export class TendersModule {}
