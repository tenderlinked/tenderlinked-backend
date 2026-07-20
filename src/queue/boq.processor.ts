import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { extractTenderDetailsFromPdf, extractTenderDetailsFromText, ExtractedTenderDetails } from '../scraper/pdf-extractor';
import { categorizeTender } from '../common/utils/tender-categorizer.util';
import { generateEmbedding } from '../common/utils/embedding.util';
import { EmailService } from '../email/email.service';
import * as path from 'path';
import * as fs from 'fs';
import AdmZip = require('adm-zip');
import * as xlsx from 'xlsx';
import axios from 'axios';
import { parseBoqExcel } from './boq-parser.utils';
import { S3Service } from '../aws/s3.service';
import { pipeline } from 'stream/promises';
import { extractTextWithOcr } from '../common/utils/ocr.util';
import { generateOpenAiInsights } from '../common/utils/openai-insights.util';

@Injectable()
export class BoqProcessorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly s3Service: S3Service,
  ) {}

  async processTender(tenderId: string): Promise<any> {
    
    console.log(`[BoqProcessor] Processing tender ${tenderId}...`);

    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
    });

    if (!tender) {
      console.warn(`[BoqProcessor] Tender ${tenderId} not found.`);
      return;
    }

    try {
      const stateTitle = tender.state ? tender.state.replace(/\s+/g, '-').toLowerCase() : 'unknown';
      const safeState = tender.state ? tender.state.toLowerCase() : 'unknown';
      const tId = tender.tenderCode || tender.id;

      let details: ExtractedTenderDetails | null = null;
      let boqData: any[] | null = null;
      const tenderTitle = tender.title || '';
      let bodyText = tender.description || '';
      
      // Inject main table data for better AI context
      const mainTableText = `
=== TENDER MAIN TABLE METADATA ===
Authority: ${tender.invitingAuthorityName || ''}, ${tender.invitingAuthorityAddress || ''}
Tender Ref No: ${tender.tenderRefNumber || ''}
Category: ${tender.tenderCategory || ''} / ${tender.productCategory || ''}
Location: ${tender.location || tender.city || ''}
Tender Value: ${tender.tenderValue || ''}
EMD: ${tender.emd || ''}
Tender Fee: ${tender.applicationCost || ''}
Contract Period: ${tender.periodOfWorkDays ? tender.periodOfWorkDays + ' days' : ''}
Bid Submission Start: ${tender.startDate ? tender.startDate.toISOString() : ''}
Bid Submission End: ${tender.endDate ? tender.endDate.toISOString() : ''}
Bid Opening Date: ${tender.bidOpeningDate ? tender.bidOpeningDate.toISOString() : ''}
==================================\n`;

      let combinedRawText = `${mainTableText}\n${tenderTitle} ${bodyText} `;

      // 1. Check local persistent directory first (saved by scraper)
      const localTenderDir = path.join(process.cwd(), 'downloads', safeState, tId);
      const hasLocalFiles = fs.existsSync(localTenderDir) && fs.readdirSync(localTenderDir).length > 0;
      
      let localPdfPath: string | undefined;
      let localZipPath: string | undefined;
      let filesToUpload: string[] = [];

      if (hasLocalFiles) {
        const files = fs.readdirSync(localTenderDir);
        filesToUpload = files.map(f => path.join(localTenderDir, f));
        
        const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));
        if (pdfFiles.length > 0) {
          const targetPdf = pdfFiles.find(f => {
            const lowerF = f.toLowerCase();
            return lowerF.includes('nit') || lowerF.includes('notice') || lowerF.includes('tender');
          }) || pdfFiles[0];
          localPdfPath = path.join(localTenderDir, targetPdf);
        }
        
        const zipFile = files.find(f => f.toLowerCase().endsWith('.zip') || f.toLowerCase().endsWith('.rar'));
        if (zipFile) {
          localZipPath = path.join(localTenderDir, zipFile);
        }
      }

      // Process PDF
      if (localPdfPath) {
        try {
          const PDFParser = require("pdf2json");
          let rawTextFromPdf = await Promise.race([
            new Promise<string>((resolve, reject) => {
              const pdfParser = new PDFParser(null, 1);
              pdfParser.on("pdfParser_dataError", (errData: any) => reject(errData.parserError));
              pdfParser.on("pdfParser_dataReady", () => resolve(pdfParser.getRawTextContent()));
              pdfParser.parseBuffer(fs.readFileSync(localPdfPath!));
            }),
            new Promise<string>((_, reject) =>
              setTimeout(() => reject(new Error("pdf2json timeout")), 10000)
            ),
          ]);

          // OCR FALLBACK
          const textWithoutPageBreaks = rawTextFromPdf ? rawTextFromPdf.replace(/----------------Page \(\d+\) Break----------------/g, '').trim() : '';
          
          if (!textWithoutPageBreaks || textWithoutPageBreaks.length < 50) {
            console.log(`[Queue] PDF is scanned image. Running local OCR for ${tender.tenderCode || tender.id}...`);
            rawTextFromPdf = await extractTextWithOcr(localPdfPath);
          }

          if (rawTextFromPdf) {
            const truncatedText = rawTextFromPdf.substring(0, 100000);
            bodyText += ` ${truncatedText}`;
            combinedRawText += ` ${truncatedText}`;
          }
        } catch (e) {
          console.warn(`[Queue] Failed to extract text from PDF:`, e);
        }
      }

      // Extract BOQ from local ZIP first (if it exists)
      if (localZipPath && fs.existsSync(localZipPath)) {
        try {
          boqData = await this.extractBoqFromZip(localZipPath, true);
          if (boqData && boqData.length > 0) {
            const boqText = JSON.stringify(boqData);
            bodyText += ` ${boqText}`;
            combinedRawText += ` ${boqText}`;
          }
        } catch (localExtractErr) {
          console.warn(`[Queue] Failed to extract from local ZIP, will fallback to S3: ${localExtractErr}`);
        }
      }

      // Upload ALL local files to S3 and delete them
      if (hasLocalFiles) {
        for (const filePath of filesToUpload) {
          const filename = path.basename(filePath);
          const s3Key = `tenderlinked/${safeState}/${tId}/${filename}`;
          
          try {
            await this.s3Service.uploadFile(filePath, s3Key, true); // true = delete local file after upload
            console.log(`[Queue] Uploaded ${filename} to S3 and deleted locally.`);
            
            // Fallback: If it's a zip and local extraction failed or wasn't done, try from S3 URL
            if ((!boqData || boqData.length === 0) && (filename.toLowerCase().endsWith('.zip') || filename.toLowerCase().endsWith('.rar'))) {
              const zipUrl = await this.s3Service.getPresignedUrl(s3Key);
              boqData = await this.extractBoqFromZip(zipUrl, false);
              if (boqData && boqData.length > 0) {
                const boqText = JSON.stringify(boqData);
                bodyText += ` ${boqText}`;
                combinedRawText += ` ${boqText}`;
              }
            }
          } catch (uploadErr: any) {
            console.error(`[Queue] Failed to upload ${filename} to S3:`, uploadErr.message);
          }
        }
        
        // Clean up empty directory
        if (fs.existsSync(localTenderDir)) {
          fs.rmSync(localTenderDir, { recursive: true, force: true });
        }
      }

      // Run NLP categorization (Porter Stemming + phrase-priority + title weighting)
      const categoryResult = categorizeTender(tenderTitle, bodyText);
      console.log(`[Queue] Category: ${categoryResult.category} (confidence: ${categoryResult.confidence}%) | WorkType: ${categoryResult.workType}`);

      // ── AI Processing Mode ───────────────────────────────────────────────────
      // Reads ACTIVE_AI_MODE set by the admin panel when triggering the scrape:
      //   'local-nlp'    → free, uses only local NLP categorizer (default if not set)
      //   'openai-mini'  → gpt-4o-mini: cheap & structured (~$0.001/tender)
      //   'openai-4o'    → gpt-4o: best quality (~$0.005/tender)
      const aiModeSetting = await this.prisma.systemSetting.findUnique({
        where: { key: 'ACTIVE_AI_MODE' }
      });
      const aiMode = aiModeSetting ? aiModeSetting.value : (process.env.ACTIVE_AI_MODE || 'openai-mini');
      console.log(`[Queue] AI mode: ${aiMode}`);

      let openAiInsights: any = null;
      let openAiSummaryJson: string | null = null;

      if (aiMode === 'openai-mini' || aiMode === 'openai-4o') {
        const openAiModel = aiMode === 'openai-4o' ? 'gpt-4o' : 'gpt-4o-mini';
        try {
          if (combinedRawText && combinedRawText.trim().length > 50) {
            console.log(`[Queue] Running OpenAI (${openAiModel}) insights for tender ${tender.tenderCode || tender.id}...`);

            // Build BOQ text from boqData
            let boqText = '';
            if (boqData && boqData.length > 0) {
              const boqRows = boqData.slice(0, 200).map((item: any) =>
                `${item.slNo || ''} | ${item.description || ''} | Qty: ${item.quantity || ''} | Unit: ${item.unit || ''} | Rate: ${item.rate || ''} | Amount: ${item.amount || ''}`
              ).join('\n');
              boqText = `\n\n=== BOQ ITEMS (${boqData.length} entries) ===\n${boqRows}`;
            }

            // Smart budget: 70% PDF, 30% BOQ — guaranteed BOQ inclusion
            const MAX_CHARS = 20000;
            const boqBudget = boqText.length > 0 ? Math.min(boqText.length, Math.max(2000, Math.floor(MAX_CHARS * 0.30))) : 0;
            const pdfBudget = MAX_CHARS - boqBudget;
            const inputText = `${combinedRawText.substring(0, pdfBudget)}${boqText.substring(0, boqBudget)}`.trim();

            openAiInsights = await generateOpenAiInsights(inputText, openAiModel, Infinity);
            openAiSummaryJson = JSON.stringify(openAiInsights);

            const usage = openAiInsights.tokenUsage;
            console.log(`[Queue] OpenAI done — tokens: ${usage?.totalTokens}, cost: $${usage?.actualCostUsd ?? usage?.estimatedCostUsd} (cached: ${usage?.cachedTokens ?? 0})`);
          }
        } catch (aiErr: any) {
          console.warn(`[Queue] OpenAI insights failed for ${tender.tenderCode || tender.id}: ${aiErr.message}. Continuing with NLP only.`);
        }
      }

      details = {
        aiSummary: openAiSummaryJson,
        tags: openAiInsights?.tags
          ? [...new Set([...categoryResult.tags, ...openAiInsights.tags])]
          : categoryResult.tags,
        tenderValue: openAiInsights?.tenderValue ?? null,
        emd: openAiInsights?.emd ?? null,
        applicationCost: openAiInsights?.tenderFee ?? null,
      };

      // 4. Save to Database
      if (details) {
        const aiData: any = {
          aiSummary: details.aiSummary,
          tags: details.tags,
          aiCategory: categoryResult.category,
          aiProcessed: true,
          aiError: null,
        };

        if (hasLocalFiles) {
          aiData.documentsDownloaded = true;
        }

        const tenderUpdate: any = {};
        if (details.tenderValue) tenderUpdate.tenderValue = details.tenderValue;
        if (details.emd) tenderUpdate.emd = details.emd;
        if (details.applicationCost) tenderUpdate.applicationCost = details.applicationCost;
        if (details.bidOpeningDate) {
          const prefix = tender.description ? `${tender.description} | ` : '';
          tenderUpdate.description = `${prefix}Bid Opening: ${details.bidOpeningDate}`;
        }

        await this.prisma.tenderAiData.upsert({
          where: { tenderId: tender.id },
          create: { tenderId: tender.id, ...aiData },
          update: aiData,
        });

        if (Object.keys(tenderUpdate).length > 0) {
          await this.prisma.tender.update({
            where: { id: tender.id },
            data: tenderUpdate,
          });
        }

        // Generate and save Semantic Vector Embedding
        const textForEmbedding = `${tenderTitle} ${tender.description || ''} ${categoryResult.category} ${categoryResult.tags.join(' ')}`.trim();
        const embeddingVector = await generateEmbedding(textForEmbedding);
        if (embeddingVector && embeddingVector.length === 384) {
          const vectorStr = `[${embeddingVector.join(',')}]`;
          await this.prisma.$executeRawUnsafe(`UPDATE "TenderAiData" SET embedding = '${vectorStr}'::vector WHERE "tenderId" = '${tender.id}'`);
        }

        if (boqData && boqData.length > 0) {
           await this.prisma.tenderBoq.upsert({
              where: { tenderId: tender.id },
              update: { boqData: boqData },
              create: { tenderId: tender.id, boqData: boqData }
           });
        }

        if (combinedRawText && combinedRawText.trim().length > 0) {
           await this.prisma.tenderDocumentText.upsert({
              where: { tenderId: tender.id },
              update: { rawText: combinedRawText },
              create: { tenderId: tender.id, rawText: combinedRawText }
           });
        }

        const keywordsData = await this.prisma.priorityKeyword.findMany();
        const priorityKeywords = keywordsData.map((k: any) => k.word.toLowerCase());

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
          const recipients = await (this.prisma as any).emailRecipient.findMany();
          for (const r of recipients) {
            this.emailService
              .sendHighPriorityTenderEmail([{ ...tender, aiSummary: details.aiSummary }], 'Unified', r.email, r.name, false)
              .catch(console.error);
          }
        }
      } else {
        await this.prisma.tenderAiData.upsert({
          where: { tenderId: tender.id },
          create: { tenderId: tender.id, aiProcessed: true, aiError: 'No text or data could be extracted.' },
          update: { aiProcessed: true, aiError: 'No text or data could be extracted.' },
        });
      }

    } catch (error: any) {
      const isRateLimit = error?.status === 503 || error?.status === 429;
      const errorMessage = isRateLimit
        ? `Gemini ${error.status} Error`
        : error.message || 'Unknown Error';

      await this.prisma.tenderAiData.upsert({
        where: { tenderId: tender.id },
        create: { tenderId: tender.id, aiError: errorMessage },
        update: { aiError: errorMessage },
      });

      if (isRateLimit) {
        console.warn(`[BoqProcessor] Halting queue processing due to Gemini ${error.status} Rate Limit.`);
        throw new Error('Rate limit hit. Delaying job.');
      }
    } finally {
      // Cleanup: Delete the downloaded PDF file to free up disk space
      try {
        const downloadsDir = path.join(process.cwd(), 'downloads');
        const fileName = `tender_${tender.id}.pdf`;
        const localPdfPath = path.join(downloadsDir, fileName);
        if (fs.existsSync(localPdfPath)) {
          fs.unlinkSync(localPdfPath);
        }
      } catch (cleanupErr) {
        console.error(`[BoqProcessor] Failed to delete temporary PDF file for tender ${tender.id}:`, cleanupErr);
      }
    }
    
    return { success: true };
  }

  async extractBoqFromZip(source: string, isLocal = false): Promise<any[]> {
    try {
      let zipBuffer: Buffer;
      
      if (isLocal) {
        console.log(`[BoqProcessor] Loading local ZIP from ${source}...`);
        zipBuffer = fs.readFileSync(source);
      } else {
        console.log(`[BoqProcessor] Downloading ZIP from ${source}...`);
        const response = await axios.get(source, {
          responseType: 'arraybuffer',
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0',
          },
        });
        zipBuffer = response.data;
      }

      const zip = new AdmZip(zipBuffer);
      const zipEntries = zip.getEntries();
      let boqExcelBuffer: Buffer | null = null;

      for (const entry of zipEntries) {
        const fileName = entry.entryName.toLowerCase();
        if (fileName.endsWith('.xls') || fileName.endsWith('.xlsm') || fileName.endsWith('.xlsx')) {
          boqExcelBuffer = entry.getData();
          break;
        }
      }

      if (!boqExcelBuffer) {
         console.log('[BoqProcessor] No Excel file found in ZIP');
         return [];
      }

      return parseBoqExcel(boqExcelBuffer);
    } catch (error: any) {
      console.error(`[BoqProcessor] Error extracting BOQ from ZIP: ${error.message}`);
      return [];
    }
  }
}
