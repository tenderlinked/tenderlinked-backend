import { Controller, Post, HttpCode, InternalServerErrorException, UseGuards, UseInterceptors, UploadedFile, BadRequestException, Query, Res } from "@nestjs/common";
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
import { execFile } from 'child_process';
import * as util from 'util';
import puppeteer from 'puppeteer';
import { generateFullAiSummary } from '../scraper/pdf-extractor';
import { generateAiSummaryHtml } from './templates/ai-summary.template';

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
}
