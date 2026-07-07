import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { extractTenderDetailsFromPdf, extractTenderDetailsFromText, ExtractedTenderDetails } from "../scraper/pdf-extractor";
import { EmailService } from "../email/email.service";
import * as path from 'path';
import * as fs from 'fs';

import { SessionService } from "../scraper/session.service";

@Injectable()
export class QueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly sessionService: SessionService
  ) {}

  async processQueue() {
    const allPending = await this.prisma.tender.findMany({
      where: { aiProcessed: false },
      take: 10,
    });

    if (allPending.length === 0) {
      return { success: true, processed: 0, message: "Queue is empty." };
    }

    const keywordsData = await this.prisma.priorityKeyword.findMany();
    const priorityKeywords = keywordsData.map((k: any) => k.word.toLowerCase());

    let processedCount = 0;
    let errorCount = 0;
    const highPriorityTenders: any[] = [];

    for (const tender of allPending) {
      let targetPdf = tender.tenderPdfUrl;
      if (
        targetPdf &&
        !targetPdf.toLowerCase().split("?")[0].endsWith(".pdf") &&
        tender.noticePdfUrl?.toLowerCase().split("?")[0].endsWith(".pdf")
      ) {
        targetPdf = tender.noticePdfUrl;
      }
      if (!targetPdf) {
        targetPdf = tender.noticePdfUrl;
      }

      try {
        let details: ExtractedTenderDetails | null = null;
        
        if (targetPdf) {
          const fileName = `tender_${tender.id}.pdf`;
          const localPdfPath = path.join(process.cwd(), 'downloads', fileName);
          
          if (tender.level === "STATE") {
            // Requirement: Download is done during scraping. SKIP expensive PDF extraction for State tenders.
            // Instead, use cheap text extraction to generate summary and tags from the title/description.
            details = await extractTenderDetailsFromText(tender.title, tender.description || "");
          } else {
            // Download the PDF for DISTRICT tenders
            if (!fs.existsSync(localPdfPath)) {
               try {
                  const axios = require('axios');
                  const response = await axios.get(targetPdf, {
                     responseType: "arraybuffer",
                     timeout: 30000,
                     headers: {
                       "User-Agent":
                         "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                       Accept: "application/pdf",
                     },
                  });
                  const downloadsDir = path.join(process.cwd(), 'downloads');
                  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
                  fs.writeFileSync(localPdfPath, response.data);
               } catch (downloadErr: any) {
                  console.error(`[Queue] Failed to download PDF for ${tender.id}:`, downloadErr.message);
               }
            }
          }

          if (fs.existsSync(localPdfPath) && tender.level !== "STATE") {
             details = await extractTenderDetailsFromPdf(localPdfPath);
          } else {
             details = await extractTenderDetailsFromText(tender.title, tender.description || "");
          }
        } else {
          // Fallback for tenders with no PDF URL at all
          details = await extractTenderDetailsFromText(tender.title, tender.description || "");
        }

        if (details) {
          const updateData: any = {
            aiSummary: details.aiSummary,
            tags: details.tags,
            aiProcessed: true,
            aiError: null,
          };
          
          // Only overwrite financial details if the AI specifically extracted them, 
          // otherwise preserve what the HTML scraper already found.
          if (details.tenderValue) updateData.tenderValue = details.tenderValue;
          if (details.emd) updateData.emd = details.emd;
          if (details.applicationCost) updateData.applicationCost = details.applicationCost;

          if (details.bidOpeningDate) {
            const prefix = tender.description ? `${tender.description} | ` : "";
            updateData.description = `${prefix}Bid Opening: ${details.bidOpeningDate}`;
          }

          const updatedTender = await this.prisma.tender.update({
            where: { id: tender.id },
            data: updateData,
          });
          processedCount++;

          const hasHighPriorityTag =
            details.tags &&
            details.tags.some((tag: string) =>
              priorityKeywords.some((kw: string) => tag.toLowerCase().includes(kw))
            );
          const titleMatch = priorityKeywords.some((kw: string) =>
            tender.title?.toLowerCase().includes(kw)
          );
          const summaryMatch = priorityKeywords.some((kw: string) =>
            details.aiSummary?.toLowerCase().includes(kw)
          );

          if (hasHighPriorityTag || titleMatch || summaryMatch) {
            highPriorityTenders.push(updatedTender);
          }
        } else {
          await this.prisma.tender.update({
            where: { id: tender.id },
            data: {
              aiProcessed: true,
              aiError: "No text or data could be extracted.",
            },
          });
          errorCount++;
        }

        await new Promise((r) => setTimeout(r, 3000));
      } catch (error: any) {
        const isRateLimit = error?.status === 503 || error?.status === 429;
        const errorMessage = isRateLimit
          ? `Gemini ${error.status} Error`
          : error.message || "Unknown Error";

        await this.prisma.tender.update({
          where: { id: tender.id },
          data: { aiError: errorMessage },
        });
        errorCount++;

        if (isRateLimit) {
          console.warn(`[AI Queue] Halting queue processing due to Gemini ${error.status} Rate Limit.`);
          break;
        }
      }
    }

    if (highPriorityTenders.length > 0) {
      const recipients = await (this.prisma as any).emailRecipient.findMany();
      for (const r of recipients) {
        this.emailService
          .sendHighPriorityTenderEmail(highPriorityTenders, "Unified", r.email, r.name, false)
          .catch(console.error);
      }
    }

    const remainingCount = await this.prisma.tender.count({
      where: { aiProcessed: false },
    });

    return {
      success: true,
      processed: processedCount,
      errors: errorCount,
      remaining: remainingCount,
    };
  }
}
