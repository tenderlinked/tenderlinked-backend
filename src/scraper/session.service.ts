import { Injectable, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

puppeteer.use(StealthPlugin());

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private currentCookieStr: string | null = null;
  private isFetchingSession = false;
  private sessionPromise: Promise<string | null> | null = null;

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

  updateCookiesFromHeaders(setCookieHeader: string[] | undefined) {
    if (!setCookieHeader) return;
    this.currentCookieStr = this.mergeCookies(this.currentCookieStr, setCookieHeader);
    this.logger.log(`Merged new cookies from headers. Current cookie count: ${this.currentCookieStr ? this.currentCookieStr.split('; ').length : 0}`);
  }

  async getValidSessionCookie(forceRefresh = false): Promise<string | null> {
    if (this.currentCookieStr && !forceRefresh) {
      return this.currentCookieStr;
    }

    if (this.isFetchingSession && this.sessionPromise) {
      return this.sessionPromise;
    }

    this.isFetchingSession = true;
    this.sessionPromise = this.fetchNewSessionCookie();
    
    try {
      this.currentCookieStr = await this.sessionPromise;
      return this.currentCookieStr;
    } finally {
      this.isFetchingSession = false;
      this.sessionPromise = null;
    }
  }

  private async fetchNewSessionCookie(): Promise<string | null> {
    this.logger.log("Fetching new session cookie from NICGEP...");
    try {
      const axios = require('axios');
      const res = await axios.get('https://tendersodisha.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page', {
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
          this.logger.log(`Got valid session cookie.`);
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

  async downloadDocumentWithCaptcha(detailPageUrl: string, tenderId: string): Promise<boolean> {
    this.logger.log(`Downloading document for ${tenderId} via Puppeteer...`);
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-popup-blocking']
    });

    try {
      const page = await browser.newPage();
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

      // Add console and error listeners for debugging
      page.on('console', msg => this.logger.log(`[Browser Console] ${msg.text()}`));
      page.on('pageerror', (err: any) => this.logger.error(`[Browser Error] ${err.message}`));
      page.on('request', (req: any) => {
        const url = req.url();
        if (url.includes('/nicgep/app') && req.method() === 'POST') {
          this.logger.log(`[Network POST Request] URL: ${url}, PostData: ${req.postData() || 'none'}`);
        }
      });
      page.on('response', (res: any) => {
        const url = res.url();
        if (url.includes('/nicgep/app')) {
          this.logger.log(`[Network Response] URL: ${url}, Status: ${res.status()}, Content-Type: ${res.headers()['content-type'] || 'none'}, Content-Length: ${res.headers()['content-length'] || 'none'}`);
        }
      });
      page.on('dialog', async (dialog: any) => {
        this.logger.warn(`[Browser Dialog] Message: "${dialog.message()}" (type: ${dialog.type()}). Accepting...`);
        await dialog.accept();
      });

      // Inject the current valid cookies so the server recognizes our session
      if (this.currentCookieStr) {
        const cookies = this.currentCookieStr.split('; ').map(c => {
          if (!c) return null;
          const [name, ...rest] = c.split('=');
          const cookieDomain = new URL(detailPageUrl).hostname;
          return { name: name.trim(), value: rest.join('='), domain: cookieDomain, path: '/' };
        }).filter(Boolean) as any[];
        await page.setCookie(...cookies);
      }

      // Step 1: Navigate to the tender DETAIL page to find the fresh download link
      this.logger.log(`Navigating to detail page for ${tenderId}...`);
      await page.goto(detailPageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // Save debug screenshot and HTML before clicking anything
      const beforeHtml = await page.content();
      fs.writeFileSync(path.join(process.cwd(), `before-${tenderId}.html`), beforeHtml);
      await page.screenshot({ path: path.join(process.cwd(), `before-${tenderId}.png`), fullPage: true });
      this.logger.log(`Saved debug files for detail page load of ${tenderId}. Page title: "${await page.title()}"`);

      // Step 3: Configure Chrome to allow downloads natively to the downloads folder
      const downloadsDir = path.join(process.cwd(), 'downloads');
      if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

      const attachDownloadBehavior = async (p: any) => {
        try {
          const client = await p.target().createCDPSession();
          await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadsDir
          });
        } catch (e) {
          this.logger.error(`Failed to set download behavior: ${e.message}`);
        }
      };

      await attachDownloadBehavior(page);

      // Record the files currently in the downloads directory before download starts
      const getDownloadFiles = () => {
        try {
          return fs.readdirSync(downloadsDir);
        } catch (e) {
          return [];
        }
      };
      const initialFiles = getDownloadFiles();

      // Listen for popup/new tab if the link has target="_blank"
      let activePage = page;
      const popupPromise = new Promise<any>((resolve) => {
        browser.once('targetcreated', async (target) => {
          const newPage = await target.page();
          if (newPage) {
            resolve(newPage);
          }
        });
        // Timeout if no popup is created within 10 seconds
        setTimeout(() => resolve(null), 10000);
      });

      // Step 4: Click the link inside the page context using evaluate click
      this.logger.log(`Clicking download link for ${tenderId}...`);
      const clickSuccess = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        // Primary: find a link that is in a document table AND has a PDF name or download component
        const pdfLink = links.find(a => {
          const text = a.textContent?.trim().toLowerCase() || '';
          const href = a.getAttribute('href') || '';
          const matchesHref = href.includes('docDownoad') || href.includes('docDownload') || href.includes('DirectLink_0') || href.includes('DirectLink_0_0');
          // Only match text with .pdf suffix or tendernotice to avoid nav links
          const matchesText = text.endsWith('.pdf') || text.startsWith('tendernotice');
          return matchesHref && matchesText;
        });
        if (pdfLink) {
          console.log(`[Evaluate] Found target link: id=${pdfLink.id}, text="${pdfLink.textContent?.trim()}", clicking...`);
          pdfLink.click();
          return true;
        }

        // Fallback to zip link
        const zipLink = links.find(a => {
          const text = a.textContent?.trim().toLowerCase() || '';
          const href = a.getAttribute('href') || '';
          return (href.includes('DirectLink_8') || href.includes('DirectLink_7')) && text.includes('zip');
        });
        if (zipLink) {
          console.log(`[Evaluate] Found target zip link: id=${zipLink.id}, clicking...`);
          zipLink.click();
          return true;
        }
        // Log all links for debugging if nothing matched
        console.log(`[Evaluate] No download link found. Links: ${JSON.stringify(links.map(a => ({ id: a.id, text: a.textContent?.trim().substring(0, 40), href: a.getAttribute('href')?.substring(0, 80) })))}`);
        return false;
      });

      if (!clickSuccess) {
        this.logger.error(`Could not find or click download link on detail page for ${tenderId}`);
        return false;
      }

      // Check if a popup was created
      const popupPage = await popupPromise;
      if (popupPage) {
        this.logger.log(`Popup window detected for download.`);
        activePage = popupPage;
        await attachDownloadBehavior(activePage);
        await activePage.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        
        // Add console and error listeners to the new popup page as well
        activePage.on('console', msg => this.logger.log(`[Popup Console] ${msg.text()}`));
        activePage.on('pageerror', (err: any) => this.logger.error(`[Popup Error] ${err.message}`));
        activePage.on('request', (req: any) => {
          const url = req.url();
          if (url.includes('/nicgep/app') && req.method() === 'POST') {
            this.logger.log(`[Popup Network POST Request] URL: ${url}, PostData: ${req.postData() || 'none'}`);
          }
        });
        activePage.on('response', (res: any) => {
          const url = res.url();
          if (url.includes('/nicgep/app')) {
            this.logger.log(`[Popup Network Response] URL: ${url}, Status: ${res.status()}, Content-Type: ${res.headers()['content-type'] || 'none'}, Content-Length: ${res.headers()['content-length'] || 'none'}`);
          }
        });
        activePage.on('dialog', async (dialog: any) => {
          this.logger.warn(`[Popup Browser Dialog] Message: "${dialog.message()}" (type: ${dialog.type()}). Accepting...`);
          await dialog.accept();
        });
      }

      // Step 5: Check if we got the PDF directly or if there's a captcha on the active page
      await new Promise(r => setTimeout(r, 2000)); // wait for navigation/render
      
      // Wait for page to load and check cookies
      const preClickCookies = await activePage.cookies();
      this.logger.log(`[Cookies Before Click] count: ${preClickCookies.length}. Names: ${preClickCookies.map(c => c.name).join(', ')}`);

      let captchaElement = await activePage.$('img#captchaImage');
      if (captchaElement) {
        let captchaSolved = false;
        for (let attempt = 1; attempt <= 4; attempt++) {
          captchaElement = await activePage.$('img#captchaImage');
          if (!captchaElement) {
            this.logger.log(`No captcha element detected on attempt ${attempt}. Assuming captcha is bypassed.`);
            captchaSolved = true;
            break;
          }

          this.logger.log(`Document Captcha detected (Attempt ${attempt}/4) for ${tenderId}. Solving...`);
          await new Promise(r => setTimeout(r, 1500));
          
          // Save debug screenshot of the captcha page
          const captchaPageHtml = await activePage.content();
          fs.writeFileSync(path.join(process.cwd(), `captcha-${tenderId}.html`), captchaPageHtml);
          await activePage.screenshot({ path: path.join(process.cwd(), `captcha-${tenderId}.png`), fullPage: true });
          this.logger.log(`Saved captcha page debug files for ${tenderId} (attempt ${attempt})`);

          const buffer = await captchaElement.screenshot();
          const base64Image = Buffer.from(buffer).toString('base64');

          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
          const result = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: [
              'This is a CAPTCHA image. It contains exactly 6 alphanumeric characters (mix of numbers and letters, case-sensitive). Ignore the blue noise dots, lines, and distortion. Output ONLY the 6 characters, with no spaces, no punctuation, and no other text.',
              { inlineData: { mimeType: 'image/png', data: base64Image } },
            ],
          });

          const captchaText = result.text?.trim() || '';
          this.logger.log(`Solved Document Captcha: ${captchaText}`);

          await activePage.waitForSelector('#captchaText');
          await activePage.evaluate(() => {
            const input = document.getElementById('captchaText') as HTMLInputElement;
            if (input) input.value = '';
          });
          await activePage.type('#captchaText', captchaText);

          // Check cookies before submitting
          const preSubmitCookies = await activePage.cookies();
          this.logger.log(`[Cookies Before Submit] count: ${preSubmitCookies.length}. Names: ${preSubmitCookies.map(c => c.name).join(', ')}`);

          // Set Tapestry submitname and submitmode manually in the DOM
          await activePage.evaluate(() => {
            const form = document.getElementById('frmCaptcha') as any;
            if (form) {
              if (form.submitname) form.submitname.value = 'Submit';
              if (form.submitmode) form.submitmode.value = 'submit';
            }
          });

          // Click the Submit button explicitly to trigger validateCaptcha()
          await activePage.click('#Submit');

          // Wait for details page to render and stabilize
          this.logger.log(`Waiting for page to navigate and load after Captcha submission (attempt ${attempt})...`);
          await new Promise(r => setTimeout(r, 4500));

          // Check if we stayed on the captcha page
          const stillHasCaptcha = await activePage.evaluate(() => {
            return document.getElementById('captchaText') !== null;
          });

          if (!stillHasCaptcha) {
            this.logger.log(`Successfully bypassed captcha on attempt ${attempt}.`);
            captchaSolved = true;
            break;
          } else {
            this.logger.warn(`Captcha attempt ${attempt} failed (Invalid Captcha). Retrying with new captcha image...`);
          }
        }

        if (!captchaSolved) {
          this.logger.error(`Failed to solve document captcha for ${tenderId} after 4 attempts.`);
          return false;
        }

        // Debug log all links matching pdf, directlink, or docdownload
        const filteredLinks = await activePage.evaluate(() => {
          return Array.from(document.querySelectorAll('a'))
            .filter(a => {
              const text = a.textContent?.toLowerCase() || '';
              const href = a.getAttribute('href')?.toLowerCase() || '';
              return text.includes('pdf') || href.includes('directlink') || href.includes('docdown');
            })
            .map(a => ({
              text: a.textContent?.trim() || '',
              href: a.getAttribute('href') || '',
              id: a.getAttribute('id') || ''
            }));
        });
        this.logger.log(`[Debug Filtered Links] Found ${filteredLinks.length}: ${JSON.stringify(filteredLinks)}`);

        // Click the download link a SECOND time on the details page
        const clickSuccess2 = await activePage.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a'));
          const pdfLink = links.find(a => {
            const text = a.textContent?.trim().toLowerCase() || '';
            const href = a.getAttribute('href') || '';
            return (
              (href.includes('docDownoad') || href.includes('docDownload') || href.includes('DirectLink_0') || href.includes('DirectLink_0_0')) &&
              (text.endsWith('.pdf') || text.includes('notice') || text.includes('tender'))
            );
          });
          if (pdfLink) {
            pdfLink.click();
            return true;
          }

          // Fallback to zip link
          const zipLink = links.find(a => {
            const text = a.textContent?.trim().toLowerCase() || '';
            const href = a.getAttribute('href') || '';
            return (href.includes('DirectLink_8') || href.includes('DirectLink_7')) && text.includes('zip');
          });
          if (zipLink) {
            zipLink.click();
            return true;
          }
          return false;
        });

        if (clickSuccess2) {
          this.logger.log(`Successfully navigated back to details page. Session verified. Clicked download link a SECOND time.`);
        } else {
          this.logger.warn(`Did not detect details page download link after captcha submit. Current title: "${await activePage.title()}"`);
        }
      } else {
        this.logger.log(`No captcha page for ${tenderId}, checking for downloaded file...`);
      }

      // Step 6: Wait up to 25 seconds for a new file to appear and complete downloading
      let downloadedFileName: string | null = null;
      let waitMs = 0;
      while (waitMs < 25000) {
        const currentFiles = getDownloadFiles();
        const newFiles = currentFiles.filter((f: string) => !initialFiles.includes(f));
        
        // Find any file that is NOT currently downloading (Chrome temp files end in .crdownload)
        const completedFile = newFiles.find((f: string) => !f.endsWith('.crdownload') && !f.endsWith('.tmp'));
        if (completedFile) {
          downloadedFileName = completedFile;
          break;
        }
        await new Promise(r => setTimeout(r, 1000));
        waitMs += 1000;
      }

      if (downloadedFileName) {
        const ext = path.extname(downloadedFileName) || '.pdf';
        const oldPath = path.join(downloadsDir, downloadedFileName);
        const newPath = path.join(downloadsDir, `tender_${tenderId}${ext}`);
        
        // Rename the file to our standardized name
        if (fs.existsSync(newPath)) fs.unlinkSync(newPath);
        fs.renameSync(oldPath, newPath);
        
        this.logger.log(`✅ Document saved successfully: ${newPath} (${(fs.statSync(newPath).size / 1024).toFixed(1)} KB)`);
        return true;
      } else {
        const pageTitle = await activePage.title();
        const html = await activePage.content();
        fs.writeFileSync(path.join(process.cwd(), `error-${tenderId}.html`), html);
        await activePage.screenshot({ path: path.join(process.cwd(), `error-${tenderId}.png`), fullPage: true });
        
        // Capture chrome://downloads for debugging
        try {
          const debugPage = await browser.newPage();
          await debugPage.goto('chrome://downloads', { waitUntil: 'domcontentloaded', timeout: 5000 });
          const debugHtml = await debugPage.content();
          fs.writeFileSync(path.join(process.cwd(), `chrome-downloads-${tenderId}.html`), debugHtml);
          await debugPage.screenshot({ path: path.join(process.cwd(), `chrome-downloads-${tenderId}.png`), fullPage: true });
        } catch (dbErr: any) {
          this.logger.error(`Failed to capture chrome://downloads: ${dbErr.message}`);
        }

        this.logger.error(`Failed to capture document for ${tenderId}. Page title: "${pageTitle}". Saved debug files.`);
        return false;
      }

    } catch (error: any) {
      this.logger.error(`Failed to download document: ${error.message}`);
      return false;
    } finally {
      await browser.close();
    }
  }
}
