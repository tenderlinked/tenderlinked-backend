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
import * as mammoth from 'mammoth';

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
      // NOTE: scraper saves to downloads/<stateSlug>/<tenderId>/ where stateSlug uses hyphens (e.g. 'west-bengal')
      // stateTitle already has hyphens, safeState has spaces — must use stateTitle here to match!
      let localTenderDir = path.join(process.cwd(), 'downloads', stateTitle, tId);
      
      // Fallback: scrapers often save using the source's tenderId instead of our generated tenderCode
      if (!fs.existsSync(localTenderDir) && tender.tenderId) {
        const altDir = path.join(process.cwd(), 'downloads', stateTitle, tender.tenderId);
        if (fs.existsSync(altDir)) {
          localTenderDir = altDir;
        }
      }

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

      // Extract BOQ AND PDFs from local ZIP (recursively handles nested ZIPs — e.g. Andhra Pradesh)
      if (localZipPath && fs.existsSync(localZipPath)) {
        try {
          const zipBuffer = fs.readFileSync(localZipPath);
          const { pdfEntries, docEntries, excelBuffers } = this.extractAllFromZipBuffer(zipBuffer);

          // Sort PDFs by priority:
          //   P1 (0): NIT / notice / tender document / index / general  → gets most chars
          //   P2 (1): schedule / boq / work item / commercial         → secondary
          //   P3 (2): everything else                                 → remainder only
          const getPriority = (name: string): number => {
            const n = name.toLowerCase();
            if (/nit|notice|inviting|tender_doc|tendernotice|index|general|rfp|rfq/.test(n)) return 0;
            if (/schedule|boq|work_item|workitem|bill.of|commercial/.test(n)) return 1;
            return 2;
          };
          pdfEntries.sort((a, b) => getPriority(a.name) - getPriority(b.name));

          let remainingBudget = 60000;

          console.log(`[Queue] ZIP has ${pdfEntries.length} PDF(s): ${pdfEntries.map(e => `${e.name}(P${getPriority(e.name)})`).join(', ')}`);

          for (const pdfEntry of pdfEntries) {
            if (remainingBudget <= 0) {
              console.log(`[Queue] Skipping ${pdfEntry.name} — global budget exhausted.`);
              continue;
            }

            // To prevent a single massive PDF from starving others, cap a single file to 45,000 chars if there are multiple files
            let fileBudget = pdfEntries.length > 1 ? Math.min(45000, remainingBudget) : remainingBudget;

            try {
              const PDFParser = require('pdf2json');
              let rawTextFromPdf = await Promise.race([
                new Promise<string>((resolve, reject) => {
                  const pdfParser = new PDFParser(null, 1);
                  pdfParser.on('pdfParser_dataError', (errData: any) => reject(errData.parserError));
                  pdfParser.on('pdfParser_dataReady', () => resolve(pdfParser.getRawTextContent()));
                  pdfParser.parseBuffer(pdfEntry.buffer);
                }),
                new Promise<string>((_, reject) => setTimeout(() => reject(new Error('pdf2json timeout')), 10000)),
              ]);

              // OCR fallback for scanned PDFs
              const textWithoutBreaks = rawTextFromPdf ? rawTextFromPdf.replace(/----------------Page \(\d+\) Break----------------/g, '').trim() : '';
              if (!textWithoutBreaks || textWithoutBreaks.length < 50) {
                console.log(`[Queue] ${pdfEntry.name} is scanned image PDF. Running OCR...`);
                const tempPdfPath = path.join(process.cwd(), 'downloads', '_temp', `ocr_${tId}_${pdfEntry.name}.pdf`);
                fs.mkdirSync(path.dirname(tempPdfPath), { recursive: true });
                fs.writeFileSync(tempPdfPath, pdfEntry.buffer);
                rawTextFromPdf = await extractTextWithOcr(tempPdfPath);
                try { fs.unlinkSync(tempPdfPath); } catch {}
              }

              if (rawTextFromPdf) {
                const capped = rawTextFromPdf.substring(0, fileBudget);
                remainingBudget -= capped.length;
                bodyText += ` ${capped}`;
                combinedRawText += ` ${capped}`;
                console.log(`[Queue] +${capped.length} chars from ${pdfEntry.name}. (Remaining global budget: ${remainingBudget})`);
              }
            } catch (pdfErr: any) {
              console.warn(`[Queue] Failed to extract text from ${pdfEntry.name}: ${pdfErr.message}`);
            }
          }

          // Extract text from Word documents (if any)
          for (const docEntry of docEntries) {
            try {
              if (docEntry.name.toLowerCase().endsWith('.docx')) {
                const result = await mammoth.extractRawText({ buffer: docEntry.buffer });
                const docText = result.value.trim();
                if (docText) {
                  let docBudget = docEntries.length + pdfEntries.length > 1 ? Math.min(30000, remainingBudget) : remainingBudget;
                  const capped = docText.substring(0, docBudget);
                  remainingBudget -= capped.length;
                  bodyText += ` ${capped}`;
                  combinedRawText += ` ${capped}`;
                  console.log(`[Queue] +${capped.length} chars from ${docEntry.name}. (Remaining global budget: ${remainingBudget})`);
                }
              } else {
                console.warn(`[Queue] .doc parsing not fully supported (only .docx): ${docEntry.name}`);
              }
            } catch (docErr: any) {
              console.warn(`[Queue] Failed to extract text from Word document ${docEntry.name}: ${docErr.message}`);
            }
          }

          // Extract BOQ from Excel files inside ZIP
          if (excelBuffers.length > 0 && (!boqData || (boqData as any[]).length === 0)) {
            for (const excelBuf of excelBuffers) {
              try {
                const parsed = parseBoqExcel(excelBuf);
                if (parsed && parsed.length > 0) {
                  boqData = parsed;
                  const boqText = JSON.stringify(boqData);
                  bodyText += ` ${boqText}`;
                  combinedRawText += ` ${boqText}`;
                  break;
                }
              } catch {}
            }
          }
        } catch (localExtractErr) {
          console.warn(`[Queue] Failed to extract from local ZIP: ${localExtractErr}`);
        }
      }

      // Upload ALL local files to S3 and delete them
      if (hasLocalFiles) {
        for (const filePath of filesToUpload) {
          const filename = path.basename(filePath);
          const s3Key = `tenderlinked/${stateTitle}/${tId}/${filename}`;
          
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

  /**
   * Recursively extract all PDFs and Excel files from a ZIP buffer,
   * handling arbitrarily nested ZIPs (e.g. Andhra Pradesh docs with zip-in-zip).
   * Returns named entries so callers can prioritise by filename.
   */
  private extractAllFromZipBuffer(
    zipBuffer: Buffer,
    depth = 0,
  ): { pdfEntries: { name: string; buffer: Buffer }[]; docEntries: { name: string; buffer: Buffer }[]; excelBuffers: Buffer[] } {
    const MAX_DEPTH = 5;
    const pdfEntries: { name: string; buffer: Buffer }[] = [];
    const docEntries: { name: string; buffer: Buffer }[] = [];
    const excelBuffers: Buffer[] = [];

    if (depth > MAX_DEPTH) {
      console.warn(`[BoqProcessor] Max ZIP nesting depth (${MAX_DEPTH}) reached — stopping recursion.`);
      return { pdfEntries, docEntries, excelBuffers };
    }

    try {
      const zip = new AdmZip(zipBuffer);
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue;
        // Use just the base filename for readability (path.basename handles forward/back slashes)
        const baseName = entry.entryName.replace(/\\/g, '/').split('/').pop() || entry.entryName;
        const nameLower = baseName.toLowerCase();
        try {
          const data = entry.getData();
          if (nameLower.endsWith('.pdf')) {
            console.log(`[BoqProcessor] Found PDF (depth=${depth}): ${baseName}`);
            pdfEntries.push({ name: baseName, buffer: data });
          } else if (nameLower.endsWith('.doc') || nameLower.endsWith('.docx')) {
            console.log(`[BoqProcessor] Found Word Doc (depth=${depth}): ${baseName}`);
            docEntries.push({ name: baseName, buffer: data });
          } else if (nameLower.endsWith('.zip') || nameLower.endsWith('.rar')) {
            console.log(`[BoqProcessor] Found nested ZIP (depth=${depth}): ${baseName} — recursing...`);
            const nested = this.extractAllFromZipBuffer(data, depth + 1);
            pdfEntries.push(...nested.pdfEntries);
            docEntries.push(...nested.docEntries);
            excelBuffers.push(...nested.excelBuffers);
          } else if (nameLower.endsWith('.xls') || nameLower.endsWith('.xlsx') || nameLower.endsWith('.xlsm')) {
            console.log(`[BoqProcessor] Found Excel (depth=${depth}): ${baseName}`);
            excelBuffers.push(data);
          }
        } catch (entryErr: any) {
          console.warn(`[BoqProcessor] Failed to read ZIP entry ${baseName}: ${entryErr.message}`);
        }
      }
    } catch (zipErr: any) {
      console.warn(`[BoqProcessor] Failed to open ZIP at depth ${depth}: ${zipErr.message}`);
    }

    return { pdfEntries, docEntries, excelBuffers };
  }

  async extractBoqFromZip(source: string, isLocal = false): Promise<any[]> {
    try {
      let zipBuffer: Buffer;
      if (isLocal) {
        zipBuffer = fs.readFileSync(source);
      } else {
        const response = await axios.get(source, { responseType: 'arraybuffer', timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        zipBuffer = response.data;
      }
      const { excelBuffers } = this.extractAllFromZipBuffer(zipBuffer);
      for (const buf of excelBuffers) {
        const parsed = parseBoqExcel(buf);
        if (parsed && parsed.length > 0) return parsed;
      }
      return [];
    } catch (error: any) {
      console.error(`[BoqProcessor] Error extracting BOQ from ZIP: ${error.message}`);
      return [];
    }
  }
}
