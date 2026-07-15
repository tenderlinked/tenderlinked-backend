import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { BoqProcessorService } from "./boq.processor";

@Injectable()
export class QueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boqProcessorService: BoqProcessorService
  ) {}

  async processQueue() {
    const allPending = await this.prisma.tender.findMany({
      where: { aiProcessed: false },
      take: 10,
    });

    if (allPending.length === 0) {
      return { success: true, processed: 0, message: "Queue is empty." };
    }

    // Fire and forget a sequential worker loop
    // This prevents the API from blocking, but ensures we only process 1 PDF at a time
    // to prevent CPU/RAM spikes on the VPS which would slow down the main website.
    (async () => {
      for (const tender of allPending) {
        await this.prisma.tender.update({
          where: { id: tender.id },
          data: { aiProcessed: true, aiError: 'Processing in background' }
        });

        try {
          // AWAIT ensures sequential execution (Concurrency: 1)
          await this.boqProcessorService.processTender(tender.id);
        } catch (err) {
          console.error(`[BoqProcessorService] Failed to process tender ${tender.id}:`, err);
        }
      }
    })();

    const remainingCount = await this.prisma.tender.count({
      where: { aiProcessed: false },
    });

    return {
      success: true,
      processed: allPending.length,
      errors: 0,
      remaining: remainingCount,
      message: `Dispatched ${allPending.length} jobs to background sequential worker.`
    };
  }
}
