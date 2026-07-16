import { Module } from "@nestjs/common";
import { TendersService } from "./tenders.service";
import { TendersController } from "./tenders.controller";
import { CreditsModule } from "../credits/credits.module";
import { QueueModule } from "../queue/queue.module";
import { SavedFiltersController } from "./saved-filters.controller";
import { SavedFiltersService } from "./saved-filters.service";

@Module({
  imports: [
    CreditsModule,
    QueueModule
  ],
  controllers: [TendersController, SavedFiltersController],
  providers: [TendersService, SavedFiltersService],
})
export class TendersModule {}
