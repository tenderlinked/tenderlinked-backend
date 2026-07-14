import { Injectable, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

puppeteer.use(StealthPlugin());

import { S3Service } from '../aws/s3.service';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private cookiesMap: Map<string, string> = new Map();
  private sessionPromises: Map<string, Promise<string | null>> = new Map();

  constructor(private readonly s3Service: S3Service) {}

  private mergeCookies(oldCookieStr: string | null, setCookieHeader: string[] | undefined): string | null {
    if (!setCookieHeader) return oldCookieStr;
    const cookieMap = new Map<string, string>();
    
    if (oldCookieStr) {
      oldCookieStr.split('; ').forEach(c => {
        if (!c) return;
        const [name, ...rest] = c.split('=');
        cookieMap.set(name.trim(), rest.join('='));
      });
    }

    setCookieHeader.forEach(c => {
      if (!c) return;
      const parts = c.split(';')[0];
      const [name, ...rest] = parts.split('=');
      cookieMap.set(name.trim(), rest.join('='));
    });

    const merged = Array.from(cookieMap.entries()).map(([name, value]) => `${name}=${value}`).join('; ');
    return merged;
  }

  updateCookiesFromHeaders(baseUrl: string, setCookieHeader: string[] | undefined) {
    if (!setCookieHeader) return;
    const oldCookie = this.cookiesMap.get(baseUrl) || null;
    const merged = this.mergeCookies(oldCookie, setCookieHeader);
    if (merged) {
      this.cookiesMap.set(baseUrl, merged);
      this.logger.log(`[${baseUrl}] Merged new cookies from headers.`);
    }
  }

  async getValidSessionCookie(baseUrl: string, forceRefresh = false): Promise<string | null> {
    if (this.cookiesMap.has(baseUrl) && !forceRefresh) {
      return this.cookiesMap.get(baseUrl)!;
    }

    if (this.sessionPromises.has(baseUrl)) {
      return this.sessionPromises.get(baseUrl)!;
    }

    const promise = this.fetchNewSessionCookie(baseUrl);
    this.sessionPromises.set(baseUrl, promise);
    
    try {
      const cookieStr = await promise;
      if (cookieStr) this.cookiesMap.set(baseUrl, cookieStr);
      return cookieStr;
    } finally {
      this.sessionPromises.delete(baseUrl);
    }
  }

  private async fetchNewSessionCookie(baseUrl: string): Promise<string | null> {
    this.logger.log(`[${baseUrl}] Fetching new session cookie from NICGEP...`);
    try {
      const axios = require('axios');
      const res = await axios.get(`${baseUrl}/nicgep/app?page=FrontEndTendersByOrganisation&service=page`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        maxRedirects: 5,
      });

      const setCookies = res.headers['set-cookie'];
      if (setCookies) {
        const cookieStr = setCookies.map((c: string) => c.split(';')[0]).join('; ');
        const hasJsessionid = cookieStr.includes('JSESSIONID');
        if (hasJsessionid) {
          this.logger.log(`[${baseUrl}] Got valid session cookie.`);
          return cookieStr;
        }
      }

      this.logger.error("No JSESSIONID in response cookies.");
      return null;
    } catch (error: any) {
      this.logger.error(`Failed to fetch session: ${error.message}`);
      return null;
    }
  }

  /**
   * Downloads ALL documents for a tender:
   *   - NIT PDFs (DirectLink_0, DirectLink_0_0, DirectLink_0_1 ...)
   *   - Work Item zip (DirectLink_7) → extracted to XLS/XLSX/PDF files
   * Files are saved in: downloads/<downloadsSubDir>/<tenderId>/
   */
  async downloadDocumentWithCaptcha(
    detailPageUrl: string,
    tenderId: string,
    downloadsSubDir?: string,
    getStatus?: () => string,
  ): Promise<boolean> {
    this.logger.log(`Downloading all documents for ${tenderId} via Puppeteer...`);

    const browser = await puppeteer.launch({
      headless: 'shell',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      );

      page.on('pageerror', (err: any) => this.logger.error(`[Browser Error] ${err.message}`));
      page.on('dialog', async (dialog: any) => { await dialog.accept(); });

      // Inject session cookies
      const baseUrlMatch = detailPageUrl.match(/^(https?:\/\/[^/]+)/);
      const baseUrl = baseUrlMatch ? baseUrlMatch[1] : '';
      const cookieStr = this.cookiesMap.get(baseUrl);

      if (cookieStr) {
        const hostname = new URL(detailPageUrl).hostname;
        const cookies = cookieStr
          .split('; ')
          .map(c => {
            if (!c) return null;
            const [name, ...rest] = c.split('=');
            return { name: name.trim(), value: rest.join('='), domain: hostname, path: '/' };
          })
          .filter(Boolean) as any[];
        await page.setCookie(...cookies);
      }

      // ── Directories ────────────────────────────────────────────────
      const baseDir = downloadsSubDir
        ? path.join(process.cwd(), 'downloads', downloadsSubDir)
        : path.join(process.cwd(), 'downloads');

      // Per-tender folder: downloads/<state>/<tenderId>/
      const tenderDir = path.join(baseDir, tenderId);
      if (!fs.existsSync(tenderDir)) fs.mkdirSync(tenderDir, { recursive: true });

      // Temp staging dir for in-progress Chrome downloads
      const tempDir = path.join(process.cwd(), 'downloads', '_temp');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      const debugDir = path.join(process.cwd(), 'debug');
      if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });

      // Tell Chrome to save downloads to temp staging dir
      const cdpClient = await page.target().createCDPSession();
      await cdpClient.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: tempDir,
      });

      // Removed aggressive popup closer to prevent stealth plugin crashes
      // ── Step 1: Navigate to tender detail page ─────────────────────
      this.logger.log(`[${tenderId}] Navigating to detail page...`);
      await page.goto(detailPageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Check if document download hasn't started yet
      const notStarted = await page.evaluate(() => {
        return document.body.innerText.includes('Document download date is not begun yet');
      });

      if (notStarted) {
        this.logger.warn(`[${tenderId}] Document download has not begun yet — skipping.`);
        return false;
      }

      // ── Step 2: Collect all downloadable links ─────────────────────
      // NIT PDFs: text ends with .pdf, id starts with "DirectLink" (DirectLink_0, DirectLink_0_0, etc.)
      // Work Item zip: text contains "zip", id starts with "DirectLink"
      const docLinks: { id: string; filename: string; type: 'pdf' | 'zip' }[] =
        await page.evaluate(() => {
          const result: { id: string; filename: string; type: 'pdf' | 'zip' }[] = [];
          document.querySelectorAll<HTMLAnchorElement>('a').forEach(a => {
            const text = (a.textContent || '').trim();
            const href = a.getAttribute('href') || '';
            const id = a.id || '';
            if (!id.startsWith('DirectLink') || !href.includes('FrontEndTenderDetails')) return;
            if (/\.pdf$/i.test(text)) {
              result.push({ type: 'pdf', filename: text, id });
            } else if (text.toLowerCase().includes('zip')) {
              result.push({ type: 'zip', filename: 'work_items.zip', id });
            }
          });
          return result;
        });

      this.logger.log(
        `[${tenderId}] Found ${docLinks.length} doc link(s): ${docLinks.map(d => `${d.type}:${d.filename}(${d.id})`).join(', ')}`,
      );

      if (docLinks.length === 0) {
        this.logger.warn(`[${tenderId}] No download links found — saving debug snapshot.`);
        fs.writeFileSync(path.join(debugDir, `before-${tenderId}.html`), await page.content());
        return false;
      }

      let anySuccess = false;
      const uploadedFiles: string[] = [];

      // ── Step 3: Download each link one by one ──────────────────────
      for (let i = 0; i < docLinks.length; i++) {
        if (getStatus && getStatus() === 'STOPPED') {
          this.logger.warn(`[${tenderId}] Scraper stopped. Aborting document downloads.`);
          break;
        }

        const docLink = docLinks[i];
        this.logger.log(
          `[${tenderId}] (${i + 1}/${docLinks.length}) Downloading ${docLink.type} "${docLink.filename}" id=${docLink.id}`,
        );

        // Clean staging dir before each download so no leftover files confuse waitForNewFile
        try {
          fs.readdirSync(tempDir).forEach(f => fs.unlinkSync(path.join(tempDir, f)));
        } catch {}
        const initialFiles = new Set(fs.readdirSync(tempDir));

        // Only navigate back if the page actually navigated away from details page
        if (i > 0 && !page.url().includes('FrontEndTenderDetails')) {
          await page.goto(detailPageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await new Promise(r => setTimeout(r, 1000));
        }

        // Click the link by element ID
        let clicked: boolean = await page.evaluate((id: string) => {
          const el = document.getElementById(id) as HTMLAnchorElement | null;
          if (el) { el.click(); return true; }
          return false;
        }, docLink.id);

        // If link not found, try reloading the details page once
        if (!clicked && i > 0) {
          this.logger.log(`[${tenderId}] Element "${docLink.id}" not found on current view. Reloading details page...`);
          await page.goto(detailPageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await new Promise(r => setTimeout(r, 1500));
          clicked = await page.evaluate((id: string) => {
            const el = document.getElementById(id) as HTMLAnchorElement | null;
            if (el) { el.click(); return true; }
            return false;
          }, docLink.id);
        }

        if (!clicked) {
          this.logger.warn(`[${tenderId}] Element id="${docLink.id}" not found — skipping.`);
          continue;
        }

        await new Promise(r => setTimeout(r, 2500));

        // Handle captcha if server shows validation page
        const captchaEl = await page.$('img#captchaImage');
        if (captchaEl) {
          this.logger.log(`[${tenderId}] Captcha required for "${docLink.filename}". Solving...`);
          const solved = await this.solveCaptchaLoop(page, tenderId);
          if (!solved) {
            this.logger.error(`[${tenderId}] Captcha failed for "${docLink.filename}" — skipping.`);
            continue;
          }
          // After captcha, page is back on details page — click the same link again
          await new Promise(r => setTimeout(r, 1000));
          await page.evaluate((id: string) => {
            const el = document.getElementById(id) as HTMLAnchorElement | null;
            if (el) el.click();
          }, docLink.id);
          await new Promise(r => setTimeout(r, 2500));
        }

        // Wait for the file to finish downloading into temp dir
        const downloadedFile = await this.waitForNewFile(tempDir, initialFiles, 30000);

        if (!downloadedFile) {
          this.logger.warn(`[${tenderId}] Timeout waiting for "${docLink.filename}" — saving debug page.`);
          fs.writeFileSync(
            path.join(debugDir, `error-${tenderId}-${docLink.id}.html`),
            await page.content(),
          );
          continue;
        }

        const srcPath = path.join(tempDir, downloadedFile);

        // Save file as is (do not extract zip!)
        const destPath = path.join(tenderDir, docLink.filename);
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        fs.renameSync(srcPath, destPath);
        const sizeKB = (fs.statSync(destPath).size / 1024).toFixed(1);
        this.logger.log(`[${tenderId}] ✅ Saved locally ${docLink.filename} (${sizeKB} KB)`);
        
        // Upload to S3
        const safeState = (downloadsSubDir || 'Unknown').toLowerCase();
        const s3Key = `tenderlinked/${safeState}/${tenderId}/${docLink.filename}`;
        await this.s3Service.uploadFile(destPath, s3Key, true); // true = delete after upload
        
        uploadedFiles.push(docLink.filename);
        anySuccess = true;
      }

      // Summary
      if (anySuccess) {
        this.logger.log(
          `[${tenderId}] ✅ All done. Uploaded ${uploadedFiles.length} file(s) to S3: ${uploadedFiles.join(', ')}`,
        );
        // Clean up the local tender directory since files are now in S3
        if (fs.existsSync(tenderDir)) {
          fs.rmSync(tenderDir, { recursive: true, force: true });
        }
      } else {
        this.logger.error(`[${tenderId}] No documents were downloaded successfully.`);
      }

      return anySuccess;

    } catch (error: any) {
      this.logger.error(`[${tenderId}] Fatal error during download: ${error.message}`);
      return false;
    } finally {
      await browser.close();
    }
  }

  /**
   * Solve the NICGEP download captcha on the current page.
   * Retries up to 4 times. Returns true if solved.
   */
  private async solveCaptchaLoop(page: any, tenderId: string): Promise<boolean> {
    for (let attempt = 1; attempt <= 4; attempt++) {
      const captchaEl = await page.$('img#captchaImage');
      if (!captchaEl) {
        this.logger.log(`[${tenderId}] Captcha gone on attempt ${attempt} — bypassed.`);
        return true;
      }

      this.logger.log(`[${tenderId}] Captcha attempt ${attempt}/4...`);
      await new Promise(r => setTimeout(r, 1000));

      const buffer = await captchaEl.screenshot();
      const base64Image = Buffer.from(buffer as Buffer).toString('base64');

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const result = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: [
          'This is a CAPTCHA image. It contains exactly 6 alphanumeric characters (mix of numbers and letters, case-sensitive). Ignore the blue noise dots, lines, and distortion. Output ONLY the 6 characters, with no spaces, no punctuation, and no other text.',
          { inlineData: { mimeType: 'image/png', data: base64Image } },
        ],
      });

      const captchaText = result.text?.trim() || '';
      this.logger.log(`[${tenderId}] Captcha answer: ${captchaText}`);

      await page.waitForSelector('#captchaText');
      await page.evaluate(() => {
        const input = document.getElementById('captchaText') as HTMLInputElement;
        if (input) input.value = '';
      });
      await page.type('#captchaText', captchaText);

      // Set hidden Tapestry form fields
      await page.evaluate(() => {
        const form = document.getElementById('frmCaptcha') as any;
        if (form) {
          if (form.submitname) form.submitname.value = 'Submit';
          if (form.submitmode) form.submitmode.value = 'submit';
        }
      });

      await page.click('#Submit');
      await new Promise(r => setTimeout(r, 4500));

      const stillHasCaptcha: boolean = await page.evaluate(
        () => document.getElementById('captchaText') !== null,
      );

      if (!stillHasCaptcha) {
        this.logger.log(`[${tenderId}] Captcha solved on attempt ${attempt}.`);
        return true;
      }
      this.logger.warn(`[${tenderId}] Captcha attempt ${attempt} wrong — retrying...`);
    }

    this.logger.error(`[${tenderId}] Captcha not solved after 4 attempts.`);
    return false;
  }

  /**
   * Poll a directory until a new completed file appears (not .crdownload or .tmp).
   * Returns the filename, or null on timeout.
   */
  private async waitForNewFile(
    dir: string,
    initialFiles: Set<string>,
    maxWaitMs = 30000,
  ): Promise<string | null> {
    let waitMs = 0;
    while (waitMs < maxWaitMs) {
      const currentFiles = fs.readdirSync(dir);
      const completed = currentFiles.find(
        f => !initialFiles.has(f) && !f.endsWith('.crdownload') && !f.endsWith('.tmp'),
      );
      if (completed) return completed;
      await new Promise(r => setTimeout(r, 1000));
      waitMs += 1000;
    }
    return null;
  }
}
