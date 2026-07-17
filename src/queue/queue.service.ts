import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { BoqProcessorService } from "./boq.processor";
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly boqProcessorService: BoqProcessorService
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    if (this.isProcessing) return;
    try {
      this.isProcessing = true;
      const result = await this.processQueue();
      if (result.processed > 0) {
         this.logger.log(`[Auto-Queue] Processed ${result.processed} tenders. Remaining: ${result.remaining}`);
      }
    } catch (e) {
      this.logger.error("Auto-queue failed", e);
    } finally {
      this.isProcessing = false;
    }
  }

  async processQueue() {
    const allPending = await this.prisma.tender.findMany({
      where: { OR: [{ aiData: null }, { aiData: { aiProcessed: false } }] },
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
        await this.prisma.tenderAiData.upsert({
          where: { tenderId: tender.id },
          create: { tenderId: tender.id, aiProcessed: true, aiError: 'Processing in background' },
          update: { aiProcessed: true, aiError: 'Processing in background' }
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
      where: { OR: [{ aiData: null }, { aiData: { aiProcessed: false } }] },
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
