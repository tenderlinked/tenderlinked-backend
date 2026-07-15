import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { extractTenderDetailsFromPdf, extractTenderDetailsFromText, ExtractedTenderDetails } from '../scraper/pdf-extractor';
import { categorizeTender } from '../common/utils/tender-categorizer.util';
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
      const tenderIdPath = tender.tenderId || 'unknown';

      const possiblePrefixes = [
        `tenders/${stateTitle}/${tenderIdPath}/`,
        `tenders/${stateLC}/${tenderIdPath}/`,
        `${stateTitle}/${tenderIdPath}/`,
        `${stateLC}/${tenderIdPath}/`,
        `tenderlinked/${stateTitle}/${tenderIdPath}/`,
        `tenderlinked/${stateLC}/${tenderIdPath}/`,
        `downloads/${stateTitle}/${tenderIdPath}/`,
        `downloads/${stateLC}/${tenderIdPath}/`
      ];

      let s3Keys: string[] = [];
      for (const prefix of possiblePrefixes) {
        s3Keys = await this.s3Service.listObjects(prefix);
        if (s3Keys.length > 0) break;
      }

      let targetPdfKey = s3Keys.find(k => k.toLowerCase().endsWith('.pdf'));
      let zipKey = s3Keys.find(k => k.toLowerCase().endsWith('.zip') || k.toLowerCase().endsWith('.rar'));

      let details: ExtractedTenderDetails | null = null;
      let boqData: any[] | null = null;

      // 2. Process PDF and BOQ based on S3 keys
      let combinedRawText = `${tender.title} ${tender.description || ''} `;
      
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
                combinedRawText += ` ${rawTextFromPdf}`;
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
              combinedRawText += ` ${JSON.stringify(boqData)}`;
           }
        }
      }

      // Run local keyword-based categorization
      const categoryResult = categorizeTender(combinedRawText);
      
      details = {
        aiSummary: null, // User requested to bypass LLM for summary
        tags: categoryResult.tags,
        tenderValue: null,
        emd: null,
        applicationCost: null,
      };

      // 4. Save to Database
      if (details) {
        const updateData: any = {
          aiSummary: details.aiSummary,
          tags: details.tags,
          tenderCategory: categoryResult.category,
          aiProcessed: true,
          aiError: null,
        };

        if (targetPdfKey || zipKey) {
          updateData.documentsDownloaded = true;
        }

        if (details.tenderValue) updateData.tenderValue = details.tenderValue;
        if (details.emd) updateData.emd = details.emd;
        if (details.applicationCost) updateData.applicationCost = details.applicationCost;

        if (details.bidOpeningDate) {
          const prefix = tender.description ? `${tender.description} | ` : '';
          updateData.description = `${prefix}Bid Opening: ${details.bidOpeningDate}`;
        }

        const updatedTender = await this.prisma.tender.update({
          where: { id: tender.id },
          data: updateData,
        });

        if (boqData && boqData.length > 0) {
           await this.prisma.tenderBoq.upsert({
              where: { tenderId: tender.id },
              update: { boqData: boqData },
              create: { tenderId: tender.id, boqData: boqData }
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
              .sendHighPriorityTenderEmail([updatedTender], 'Unified', r.email, r.name, false)
              .catch(console.error);
          }
        }
      } else {
        await this.prisma.tender.update({
          where: { id: tender.id },
          data: {
            aiProcessed: true,
            aiError: 'No text or data could be extracted.',
          },
        });
      }

    } catch (error: any) {
      const isRateLimit = error?.status === 503 || error?.status === 429;
      const errorMessage = isRateLimit
        ? `Gemini ${error.status} Error`
        : error.message || 'Unknown Error';

      await this.prisma.tender.update({
        where: { id: tender.id },
        data: { aiError: errorMessage },
      });

      if (isRateLimit) {
        console.warn(`[BoqProcessor] Halting queue processing due to Gemini ${error.status} Rate Limit.`);
        throw new Error('Rate limit hit. Delaying job.');
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
