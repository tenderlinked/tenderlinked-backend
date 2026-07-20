import { Controller, Post, HttpCode, InternalServerErrorException, UseGuards, UseInterceptors, UploadedFile, BadRequestException, Query, Res, Body, Get } from "@nestjs/common";
import type { Response } from 'express';
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody, ApiQuery } from '@nestjs/swagger';
import { QueueService } from "./queue.service";
import { SuperAdminGuard } from "../auth/guards/super-admin.guard";
import AdmZip = require('adm-zip');
import { parseBoqExcel, processRawBoqArrays } from "./boq-parser.utils";
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { extractTextWithOcr } from '../common/utils/ocr.util';
import { execFile } from 'child_process';
import * as util from 'util';
import puppeteer from 'puppeteer';
import { generateFullAiSummary } from '../scraper/pdf-extractor';
import { generateAiSummaryHtml } from './templates/ai-summary.template';
import { categorizeTender } from '../common/utils/tender-categorizer.util';
import { generateOpenAiInsights } from '../common/utils/openai-insights.util';

const execFileAsync = util.promisify(execFile);

@ApiTags("Queue")
@Controller("queue")
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Post()
  @HttpCode(200)
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Process AI queue manually" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })
  async processQueue() {
    try {
      return await this.queueService.processQueue();
    } catch (error: any) {
      console.error("[AI Queue] Fatal Error:", error);
      throw new InternalServerErrorException(error.message);
    }
  }

  @Post('test-pdf-extractor')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: "Test PDF Text Extraction and NLP Categorization" })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Upload a PDF file to test the extractor',
        },
        title: {
          type: 'string',
          description: 'Optional tender title for better categorization',
        }
      },
    },
  })
  async testPdfExtractor(@UploadedFile() file: any, @Query('title') title?: string) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    
    if (!file.originalname.toLowerCase().endsWith('.pdf')) {
       throw new BadRequestException('File must be a .pdf');
    }

    try {
      const tempPdfPath = path.join(os.tmpdir(), `test_extractor_${Date.now()}.pdf`);
      fs.writeFileSync(tempPdfPath, file.buffer);

      const PDFParser = require("pdf2json");
      let rawTextFromPdf = await Promise.race([
        new Promise<string>((resolve, reject) => {
          const pdfParser = new PDFParser(null, 1);
          pdfParser.on("pdfParser_dataError", (errData: any) => reject(errData.parserError));
          pdfParser.on("pdfParser_dataReady", () => resolve(pdfParser.getRawTextContent()));
          pdfParser.parseBuffer(fs.readFileSync(tempPdfPath));
        }),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("pdf2json timeout")), 15000)
        ),
      ]);

      const textWithoutPageBreaks = rawTextFromPdf ? rawTextFromPdf.replace(/----------------Page \(\d+\) Break----------------/g, '').trim() : '';
      if (!textWithoutPageBreaks || textWithoutPageBreaks.length < 50) {
          console.log(`[Test] PDF is scanned image. Running local OCR...`);
          rawTextFromPdf = await extractTextWithOcr(tempPdfPath);
      }

      // Cleanup
      if (fs.existsSync(tempPdfPath)) {
        fs.unlinkSync(tempPdfPath);
      }

      if (!rawTextFromPdf || rawTextFromPdf.trim().length === 0) {
         return {
            success: false,
            message: "No text extracted even after OCR. The PDF might be blank or unreadable.",
            rawTextLength: 0,
            textSample: "",
            categoryResult: null
         }
      }

      const truncatedText = rawTextFromPdf.substring(0, 100000);
      const categoryResult = categorizeTender(title || "Unknown Title", truncatedText);

      return {
        success: true,
        message: "Text successfully extracted from PDF.",
        rawTextLength: rawTextFromPdf.length,
        textSample: truncatedText.substring(0, 1000) + (truncatedText.length > 1000 ? "..." : ""),
        categoryResult,
        fullTextExtracted: rawTextFromPdf
      };

    } catch (error: any) {
      console.error(error);
      throw new InternalServerErrorException(error.message);
    }
  }

  @Post('test-boq')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: "Test BOQ Extraction from ZIP upload" })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async testBoqExtraction(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    
    if (!file.originalname.toLowerCase().endsWith('.zip')) {
       throw new BadRequestException('File must be a .zip');
    }

    try {
      const zip = new AdmZip(file.buffer);
      const zipEntries = zip.getEntries();
      let boqExcelBuffer: Buffer | null = null;
      let boqPdfBuffer: Buffer | null = null;

      for (const entry of zipEntries) {
        const fileName = entry.entryName.toLowerCase();
        if (fileName.endsWith('.xls') || fileName.endsWith('.xlsm') || fileName.endsWith('.xlsx')) {
          boqExcelBuffer = entry.getData();
          break;
        } else if (fileName.endsWith('.pdf')) {
          boqPdfBuffer = entry.getData();
        }
      }

      let boqItems: any[] = [];

      if (boqExcelBuffer) {
        boqItems = parseBoqExcel(boqExcelBuffer);
      } else if (boqPdfBuffer) {
        // Fallback to PDF extraction via Python script
        const tempPdfPath = path.join(os.tmpdir(), `boq_${Date.now()}.pdf`);
        fs.writeFileSync(tempPdfPath, boqPdfBuffer);

        try {
          const scriptPath = path.join(process.cwd(), 'scripts', 'extract_pdf.py');
          const { stdout } = await execFileAsync('python', [scriptPath, tempPdfPath], { maxBuffer: 1024 * 1024 * 10 });
          const result = JSON.parse(stdout);
          
          if (result.success && result.data) {
             boqItems = processRawBoqArrays(result.data);
          } else {
             throw new Error(result.error || "Python extraction failed");
          }
        } finally {
          // Cleanup temp file
          if (fs.existsSync(tempPdfPath)) {
            fs.unlinkSync(tempPdfPath);
          }
        }
      } else {
        return { success: false, message: 'No Excel or PDF file found in ZIP', data: [] };
      }

      return { success: true, count: boqItems.length, data: boqItems };
    } catch (error: any) {
      console.error(`[BoqTest] Error extracting BOQ from ZIP: ${error.message}`);
      throw new InternalServerErrorException(error.message);
    }
  }

  @Post('generate-ai-summary')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: "Generate AI Summary PDF from ZIP upload" })
  @ApiQuery({ name: 'mode', required: false, description: "Extraction mode: 'vision' or 'text' (default: vision)" })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async generateAiSummary(
    @UploadedFile() file: any, 
    @Query('mode') mode: string,
    @Res() res: Response
  ) {
    if (!file || !file.originalname.toLowerCase().endsWith('.zip')) {
      throw new BadRequestException('Valid .zip file is required');
    }

    const extractionMode = mode === 'text' ? 'text' : 'vision';

    try {
      const zip = new AdmZip(file.buffer);
      const zipEntries = zip.getEntries();
      let primaryPdfBuffer: Buffer | null = null;
      let maxPdfSize = 0;
      let boqItems: any[] = [];

      // Helper to extract BOQ items from an Excel buffer
      const extractBoqFromExcel = (excelBuffer: Buffer, sourceName: string): any[] => {
        try {
          console.log(`[AI Summary] Parsing Excel BOQ: ${sourceName}`);
          const rawRows = parseBoqExcel(excelBuffer);
          if (!rawRows || rawRows.length === 0) return [];
          const sampleKeys = Object.keys(rawRows[0]);
          const find = (row: any, keys: string[]) => {
            for (const k of sampleKeys) {
              if (keys.some(kw => k.toLowerCase().includes(kw))) return String(row[k] ?? '').trim();
            }
            return '';
          };
          const items = rawRows.map((row: any) => ({
            slNo:        find(row, ['sl', 'sno', 'sr', 'item no', 's.no', 'no.']),
            description: find(row, ['description', 'particulars', 'name of work', 'item', 'details', 'work']),
            unit:        find(row, ['unit', 'uom', 'measure']),
            quantity:    find(row, ['quantity', 'qty', 'nos', 'number']),
            rate:        find(row, ['rate', 'unit rate', 'basic rate']),
            amount:      find(row, ['amount', 'total', 'value', 'cost']),
          })).filter((r: any) => r.description && r.description.length > 2);
          console.log(`[AI Summary] Extracted ${items.length} BOQ items from ${sourceName}`);
          return items;
        } catch (err) {
          console.warn(`[AI Summary] Could not parse Excel BOQ ${sourceName}: ${err}`);
          return [];
        }
      };

      // Scan ZIP entries: collect largest PDF and BOQ items from Excel (including nested ZIPs)
      for (const entry of zipEntries) {
        const name = entry.entryName.toLowerCase();
        if (name.endsWith('.pdf')) {
          const data = entry.getData();
          if (data.length > maxPdfSize) {
            maxPdfSize = data.length;
            primaryPdfBuffer = data;
          }
        } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
          const items = extractBoqFromExcel(entry.getData(), entry.entryName);
          if (items.length > boqItems.length) boqItems = items;
        } else if (name.endsWith('.zip')) {
          // Nested ZIP — open it and look inside for Excel/PDF files
          try {
            console.log(`[AI Summary] Found nested ZIP: ${entry.entryName}, scanning...`);
            const nestedZip = new AdmZip(entry.getData());
            for (const nestedEntry of nestedZip.getEntries()) {
              const nName = nestedEntry.entryName.toLowerCase();
              if (nName.endsWith('.xlsx') || nName.endsWith('.xls')) {
                const items = extractBoqFromExcel(nestedEntry.getData(), nestedEntry.entryName);
                if (items.length > boqItems.length) boqItems = items;
              } else if (nName.endsWith('.pdf')) {
                const data = nestedEntry.getData();
                if (data.length > maxPdfSize) {
                  maxPdfSize = data.length;
                  primaryPdfBuffer = data;
                }
              }
            }
          } catch (nestedErr) {
            console.warn(`[AI Summary] Could not open nested ZIP ${entry.entryName}: ${nestedErr}`);
          }
        }
      }

      if (!primaryPdfBuffer) {
        throw new BadRequestException('No PDF found inside the ZIP file');
      }

      let rawText: string | null = null;
      if (extractionMode === 'text') {
        const PDFParser = require("pdf2json");
        rawText = await Promise.race([
          new Promise<string>((resolve, reject) => {
            const pdfParser = new PDFParser(null, 1);
            pdfParser.on("pdfParser_dataError", (errData: any) => reject(errData.parserError));
            pdfParser.on("pdfParser_dataReady", () => resolve(pdfParser.getRawTextContent()));
            pdfParser.parseBuffer(primaryPdfBuffer);
          }),
          new Promise<string>((_, reject) => setTimeout(() => reject(new Error("pdf2json timeout")), 15000)),
        ]) as string;
      }

      console.log(`[AI Summary] Extracting via Gemini (${extractionMode} mode)...`);
      const aiData = await generateFullAiSummary(primaryPdfBuffer, rawText, extractionMode);

      // Attach BOQ items extracted from Excel
      if (boqItems.length > 0) {
        aiData.boqItems = boqItems;
      }

      console.log(`[AI Summary] Generating PDF via Puppeteer...`);
      const htmlContent = generateAiSummaryHtml(aiData);

      const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'load' });
      
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });

      await browser.close();

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="AI_Tender_Summary.pdf"',
        'Content-Length': pdfBuffer.length,
      });

      res.send(pdfBuffer);
    } catch (error: any) {
      console.error(`[AI Summary] Error generating summary: ${error.message}`);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // ─── OpenAI Insights Test Endpoint ──────────────────────────────────────────

  @Post('test-openai-insights')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Test OpenAI AI Insights',
    description: 'Send extracted tender text and get structured AI insights (same format as the tender details page). Also returns token usage and estimated cost so you can compare OpenAI vs Gemini pricing.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        extractedText: {
          type: 'string',
          description: 'The raw text extracted from the tender PDF (paste from /test-pdf-extractor endpoint)',
        },
        model: {
          type: 'string',
          enum: ['gpt-4o-mini', 'gpt-4o'],
          description: 'OpenAI model to use. gpt-4o-mini is cheapest, gpt-4o is most capable.',
          default: 'gpt-4o-mini',
        },
        maxChars: {
          type: 'number',
          description: 'Max characters of text to send to OpenAI. Lower = cheaper & faster. Try 4000 (2 pages), 8000 (5 pages), 20000 (12 pages). Default is 8000.',
          default: 8000,
        },
      },
      required: ['extractedText'],
    },
  })
  async testOpenAiInsights(
    @Body('extractedText') extractedText: string,
    @Body('model') model: 'gpt-4o-mini' | 'gpt-4o' = 'gpt-4o-mini',
    @Body('maxChars') maxChars: number = 8000,
  ) {
    if (!extractedText || extractedText.trim().length < 50) {
      throw new BadRequestException('extractedText is required and must be at least 50 characters.');
    }

    try {
      console.log(`[OpenAI Test] Generating insights using ${model}, maxChars=${maxChars}...`);
      const charLimit = Number(maxChars) > 0 ? Number(maxChars) : Infinity;
      const insights = await generateOpenAiInsights(extractedText, model, charLimit);

      return {
        success: true,
        model,
        tokenUsage: insights.tokenUsage,
        insights,
      };
    } catch (error: any) {
      console.error(`[OpenAI Test] Error:`, error.message);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // ─── OpenAI ZIP Endpoint ─────────────────────────────────────────────────────

  @Post('test-openai-zip')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Test OpenAI Insights from ZIP file',
    description: 'Upload a ZIP containing PDFs and/or Excel BOQ files. The endpoint extracts text from ALL PDFs (pdf2json + OCR fallback), parses all BOQ Excel sheets, combines everything and sends to OpenAI for structured insights. Returns token usage & estimated cost.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'ZIP file containing tender PDFs and/or BOQ Excel files',
        },
        model: {
          type: 'string',
          enum: ['gpt-4o-mini', 'gpt-4o'],
          default: 'gpt-4o-mini',
        },
        maxChars: {
          type: 'number',
          description: 'Max characters of combined text to send to OpenAI (default: 8000)',
          default: 8000,
        },
      },
      required: ['file'],
    },
  })
  async testOpenAiZip(
    @UploadedFile() file: any,
    @Body('model') model: 'gpt-4o-mini' | 'gpt-4o' = 'gpt-4o-mini',
    @Body('maxChars') maxChars: number = 8000,
  ) {
    if (!file || !file.originalname.toLowerCase().endsWith('.zip')) {
      throw new BadRequestException('A valid .zip file is required');
    }

    try {
      const zip = new AdmZip(file.buffer);
      const zipEntries = zip.getEntries();

      const allPdfBuffers: Array<{ name: string; buffer: Buffer }> = [];
      let boqItems: any[] = [];
      const extractionLog: string[] = [];

      // ── Helper: extract BOQ items from an Excel buffer ──────────────────────
      const extractBoqFromExcel = (excelBuffer: Buffer, sourceName: string): any[] => {
        try {
          const rawRows = parseBoqExcel(excelBuffer);
          if (!rawRows || rawRows.length === 0) return [];
          const sampleKeys = Object.keys(rawRows[0]);
          const find = (row: any, keys: string[]) => {
            for (const k of sampleKeys) {
              if (keys.some(kw => k.toLowerCase().includes(kw))) return String(row[k] ?? '').trim();
            }
            return '';
          };
          return rawRows.map((row: any) => ({
            slNo:        find(row, ['sl', 'sno', 'sr', 'item no', 's.no', 'no.']),
            description: find(row, ['description', 'particulars', 'name of work', 'item', 'details', 'work']),
            unit:        find(row, ['unit', 'uom', 'measure']),
            quantity:    find(row, ['quantity', 'qty', 'nos', 'number']),
            rate:        find(row, ['rate', 'unit rate', 'basic rate']),
            amount:      find(row, ['amount', 'total', 'value', 'cost']),
          })).filter((r: any) => r.description && r.description.length > 2);
        } catch {
          return [];
        }
      };

      // ── Scan top-level and nested ZIP entries ────────────────────────────────
      const processEntries = (entries: any[], prefix = '') => {
        for (const entry of entries) {
          const name = entry.entryName.toLowerCase();
          if (entry.isDirectory) continue;

          if (name.endsWith('.pdf')) {
            allPdfBuffers.push({ name: entry.entryName, buffer: entry.getData() });
            extractionLog.push(`📄 Found PDF: ${entry.entryName}`);
          } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
            const items = extractBoqFromExcel(entry.getData(), entry.entryName);
            boqItems = [...boqItems, ...items];
            extractionLog.push(`📊 Found Excel BOQ: ${entry.entryName} → ${items.length} items`);
          } else if (name.endsWith('.zip')) {
            try {
              const nestedZip = new AdmZip(entry.getData());
              processEntries(nestedZip.getEntries(), `${entry.entryName}/`);
            } catch {
              extractionLog.push(`⚠️ Could not open nested ZIP: ${entry.entryName}`);
            }
          }
        }
      };

      processEntries(zipEntries);

      if (allPdfBuffers.length === 0 && boqItems.length === 0) {
        throw new BadRequestException('No PDF or BOQ files found inside the ZIP');
      }

      // ── Extract text from ALL PDFs ───────────────────────────────────────────
      const PDFParser = require('pdf2json');
      let combinedPdfText = '';

      for (const { name, buffer } of allPdfBuffers) {
        const tempPath = path.join(os.tmpdir(), `zip_pdf_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
        fs.writeFileSync(tempPath, buffer);

        try {
          let rawText: string = await Promise.race([
            new Promise<string>((resolve, reject) => {
              const pdfParser = new PDFParser(null, 1);
              pdfParser.on('pdfParser_dataError', (e: any) => reject(e.parserError));
              pdfParser.on('pdfParser_dataReady', () => resolve(pdfParser.getRawTextContent()));
              pdfParser.parseBuffer(buffer);
            }),
            new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
          ]);

          // OCR fallback for scanned PDFs
          const textWithoutBreaks = rawText ? rawText.replace(/----------------Page \(\d+\) Break----------------/g, '').trim() : '';
          if (!textWithoutBreaks || textWithoutBreaks.length < 50) {
            extractionLog.push(`🔍 PDF "${name}" is scanned — running OCR...`);
            rawText = await extractTextWithOcr(tempPath);
          }

          if (rawText && rawText.trim().length > 0) {
            combinedPdfText += `\n\n=== PDF: ${name} ===\n${rawText}`;
            extractionLog.push(`✅ Extracted ${rawText.length} chars from PDF: ${name}`);
          } else {
            extractionLog.push(`⚠️ No text extracted from PDF: ${name}`);
          }
        } catch (err: any) {
          extractionLog.push(`❌ Error extracting PDF "${name}": ${err.message}`);
        } finally {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        }
      }

      // ── Build combined text with smart budget allocation ─────────────────────
      // Problem: if PDF fills the entire maxChars limit, BOQ is silently dropped.
      // Solution: Reserve 30% of the budget for BOQ (if BOQ exists), 70% for PDFs.
      // If no BOQ, 100% goes to PDFs. This guarantees BOQ always gets included.

      let boqText = '';
      if (boqItems.length > 0) {
        const rawBoqText = boqItems.slice(0, 200).map(item =>
          `${item.slNo || ''} | ${item.description} | Qty: ${item.quantity} | Unit: ${item.unit} | Rate: ${item.rate} | Amount: ${item.amount}`
        ).join('\n');
        boqText = `\n\n=== BOQ ITEMS (${boqItems.length} entries) ===\n${rawBoqText}`;
        extractionLog.push(`✅ Combined ${boqItems.length} BOQ items (${boqText.length} chars)`);
      }

      const charLimit = Number(maxChars) > 0 ? Number(maxChars) : Infinity;

      let pdfBudget: number;
      let boqBudget: number;

      if (boqText.length === 0) {
        // No BOQ — give all to PDF
        pdfBudget = isFinite(charLimit) ? charLimit : combinedPdfText.length;
        boqBudget = 0;
      } else if (!isFinite(charLimit)) {
        // No limit — send everything
        pdfBudget = combinedPdfText.length;
        boqBudget = boqText.length;
      } else {
        // Split: 70% PDF, 30% BOQ (minimum 2000 chars for BOQ)
        boqBudget = Math.min(boqText.length, Math.max(2000, Math.floor(charLimit * 0.30)));
        pdfBudget = charLimit - boqBudget;
      }

      const trimmedPdfText = combinedPdfText.substring(0, pdfBudget);
      const trimmedBoqText = boqText.substring(0, boqBudget);
      const fullText = `${trimmedPdfText}${trimmedBoqText}`.trim();

      extractionLog.push(`📐 Budget: PDF=${trimmedPdfText.length} chars, BOQ=${trimmedBoqText.length} chars, Total=${fullText.length} chars`);

      if (!fullText || fullText.length < 50) {
        return {
          success: false,
          message: 'Could not extract any readable text from the uploaded ZIP.',
          extractionLog,
        };
      }

      // ── Send to OpenAI ───────────────────────────────────────────────────────
      extractionLog.push(`🤖 Sending ${fullText.length} chars to OpenAI (${model})...`);
      const insights = await generateOpenAiInsights(fullText, model, Infinity); // already trimmed above

      return {
        success: true,
        model,
        extractionSummary: {
          pdfsFound: allPdfBuffers.length,
          boqItemsFound: boqItems.length,
          totalCharsExtracted: fullText.length,
          charsSentToAi: insights.tokenUsage?.inputCharsSent ?? 0,
          charsSkipped: insights.tokenUsage?.inputCharsSkipped ?? 0,
        },
        tokenUsage: insights.tokenUsage,
        extractionLog,
        insights,
      };
    } catch (error: any) {
      console.error(`[OpenAI ZIP] Error:`, error.message);
      return { success: false, message: error.message };
    }
  }
}
