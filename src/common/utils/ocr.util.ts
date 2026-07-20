import * as fs from 'fs';
import { createCanvas } from '@napi-rs/canvas';

// Hack to make pdfjs-dist use @napi-rs/canvas instead of failing to require('canvas')
import * as Module from 'module';
const originalRequire = Module.prototype.require;
(Module.prototype as any).require = function(request: string) {
  if (request === 'canvas') return require('@napi-rs/canvas');
  return originalRequire.apply(this, arguments);
};

// @ts-ignore
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';
import Tesseract from 'tesseract.js';

/**
 * Extracts text from a scanned PDF by converting pages to images and running OCR.
 * 
 * @param pdfPath Absolute path to the PDF file
 * @param maxPages Maximum number of pages to OCR (to save CPU)
 * @returns The extracted text
 */
export async function extractTextWithOcr(pdfPath: string, maxPages: number = 10): Promise<string> {
  let extractedText = '';
  
  try {
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const loadingTask = pdfjsLib.getDocument({ 
      data,
      standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/',
      disableFontFace: true
    });
    
    const pdf = await loadingTask.promise;
    const numPages = Math.min(pdf.numPages, maxPages);
    
    if (numPages === 0) return '';
    
    console.log(`[OCR] Starting OCR on ${pdfPath} (${numPages} pages)...`);
    
    // Process pages sequentially to avoid huge memory spikes
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      
      // Scale 2.0 provides good resolution for OCR while keeping memory reasonable
      const viewport = page.getViewport({ scale: 2.0 });
      
      const canvas = createCanvas(viewport.width, viewport.height);
      const context = canvas.getContext('2d');
      
      await page.render({
        canvasContext: context as any,
        viewport: viewport
      }).promise;
      
      const imageBuffer = canvas.toBuffer('image/png');
      
      console.log(`[OCR] Running Tesseract on page ${i}...`);
      const { data: { text } } = await Tesseract.recognize(
        imageBuffer,
        'eng'
      );
      
      extractedText += `\n--- OCR PAGE ${i} ---\n` + text;
      
      // Clear references to free memory
      page.cleanup();
    }
    
    console.log(`[OCR] Finished successfully.`);
  } catch (error: any) {
    console.error(`[OCR] Error extracting text from ${pdfPath}:`, error);
  }
  
  return extractedText.trim();
}
