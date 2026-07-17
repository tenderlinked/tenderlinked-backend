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
      // 1. Fetch S3 Keys
      const stateTitle = tender.state ? tender.state.replace(/\s+/g, '-').toLowerCase() : 'unknown';
      const stateLC = tender.state ? tender.state.toLowerCase().replace(/\s+/g, '-') : 'unknown';
      const identifiers = [tender.tenderId, tender.tenderCode, tender.id].filter(Boolean);
      let possiblePrefixes: string[] = [];
      
      for (const tId of identifiers) {
        if (!tId) continue;
        possiblePrefixes.push(
          `tenders/${stateTitle}/${tId}/`,
          `tenders/${stateLC}/${tId}/`,
          `${stateTitle}/${tId}/`,
          `${stateLC}/${tId}/`,
          `tenderlinked/${stateTitle}/${tId}/`,
          `tenderlinked/${stateLC}/${tId}/`,
          `downloads/${stateTitle}/${tId}/`,
          `downloads/${stateLC}/${tId}/`
        );
      }

      let s3Keys: string[] = [];
      for (const prefix of possiblePrefixes) {
        s3Keys = await this.s3Service.listObjects(prefix);
        if (s3Keys.length > 0) break;
      }

      let targetPdfKey: string | undefined;
      const pdfKeys = s3Keys.filter(k => k.toLowerCase().endsWith('.pdf'));
      if (pdfKeys.length > 0) {
        // Prioritize the main notice document (NIT) instead of parsing random drawings/annexures
        targetPdfKey = pdfKeys.find(k => {
          const lowerK = k.toLowerCase();
          return lowerK.includes('nit') || lowerK.includes('notice') || lowerK.includes('tender');
        }) || pdfKeys[0]; // Fallback to first PDF if no keywords matched
      }
      
      let zipKey = s3Keys.find(k => k.toLowerCase().endsWith('.zip') || k.toLowerCase().endsWith('.rar'));

      let details: ExtractedTenderDetails | null = null;
      let boqData: any[] | null = null;

      // 2. Process PDF and BOQ based on S3 keys
      // Keep title and body separate so the categorizer can weight them
      const tenderTitle = tender.title || '';
      let bodyText = tender.description || '';
      let combinedRawText = `${tenderTitle} ${bodyText} `;
      
      if (targetPdfKey || zipKey) {
        const downloadsDir = path.join(process.cwd(), 'downloads');
        if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

        const fileName = `tender_${tender.id}.pdf`;
        const localPdfPath = path.join(downloadsDir, fileName);

        if (targetPdfKey) {
          if (!fs.existsSync(localPdfPath)) {
            try {
              const stream = await this.s3Service.getObjectStream(targetPdfKey);
              await pipeline(stream, fs.createWriteStream(localPdfPath));
            } catch (downloadErr: any) {
              console.error(`[Queue] Failed to download PDF for ${tender.id} from S3:`, downloadErr.message);
            }
          }

          if (fs.existsSync(localPdfPath)) {
            try {
              const PDFParser = require("pdf2json");
              const rawTextFromPdf = await Promise.race([
                new Promise<string>((resolve, reject) => {
                  const pdfParser = new PDFParser(null, 1);
                  pdfParser.on("pdfParser_dataError", (errData: any) => reject(errData.parserError));
                  pdfParser.on("pdfParser_dataReady", () => resolve(pdfParser.getRawTextContent()));
                  pdfParser.parseBuffer(fs.readFileSync(localPdfPath));
                }),
                new Promise<string>((_, reject) =>
                  setTimeout(() => reject(new Error("pdf2json timeout")), 10000)
                ),
              ]);
              if (rawTextFromPdf) {
                // Limit to 100,000 characters (~30-50 pages) to ensure efficiency and save DB space
                const truncatedText = rawTextFromPdf.substring(0, 100000);
                bodyText += ` ${truncatedText}`;
                combinedRawText += ` ${truncatedText}`;
              }
            } catch (e) {
              console.warn(`[Queue] Failed to extract text from PDF:`, e);
            }
          }
        }

        if (zipKey) {
           const zipUrl = await this.s3Service.getPresignedUrl(zipKey);
           boqData = await this.extractBoqFromZip(zipUrl);
         if (boqData && boqData.length > 0) {
            const boqText = JSON.stringify(boqData);
            bodyText += ` ${boqText}`;
            combinedRawText += ` ${boqText}`;
         }
        }
      }

      // Run NLP categorization (Porter Stemming + phrase-priority + title weighting)
      const categoryResult = categorizeTender(tenderTitle, bodyText);
      console.log(`[Queue] Category: ${categoryResult.category} (confidence: ${categoryResult.confidence}%) | WorkType: ${categoryResult.workType}`);
      
      
      details = {
        aiSummary: null, // User requested to bypass LLM for summary
        tags: categoryResult.tags,
        tenderValue: null,
        emd: null,
        applicationCost: null,
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

        if (targetPdfKey || zipKey) {
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

  async extractBoqFromZip(zipUrl: string): Promise<any[]> {
    try {
      console.log(`[BoqProcessor] Downloading ZIP from ${zipUrl}...`);
      const response = await axios.get(zipUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
      });

      const zip = new AdmZip(response.data);
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
