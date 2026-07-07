import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as path from 'path';
import * as fs from 'fs';
import { GoogleGenAI } from '@google/genai';
require('dotenv').config();

puppeteer.use(StealthPlugin());

async function run() {
  console.log('Launching Stealth Puppeteer...');
  const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    console.log('1. Navigating to NICGEP Homepage...');
    await page.goto('https://tendersodisha.gov.in/nicgep/app', { waitUntil: 'domcontentloaded' });

    console.log('2. Clicking Online Bidder Enrollment...');
    const enrollHref = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      for (const a of links) { 
        if (a.textContent && a.textContent.includes('Enrollment')) {
           return a.getAttribute('href'); 
        }
      }
      return null;
    });
    
    if (!enrollHref) {
       console.error("Could not find Enrollment link");
       return;
    }
    
    await page.goto('https://tendersodisha.gov.in' + enrollHref, { waitUntil: 'domcontentloaded' });

    console.log('3. Capturing Captcha...');
    await page.waitForSelector('img#captchaImage', { timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    
    const captchaElement = await page.$('img#captchaImage');
    if (!captchaElement) return;
    
    const buffer = await captchaElement.screenshot();
    const base64Image = Buffer.from(buffer).toString('base64');

    console.log('4. Solving Captcha with Gemini...');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const result = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: [
        'Please read the alphanumeric characters in this CAPTCHA image. Output ONLY the characters, no spaces or other text.',
        { inlineData: { mimeType: 'image/png', data: base64Image } },
      ],
    });
    
    const captchaText = result.text?.trim() || '';
    console.log('Solved Captcha:', captchaText);

    console.log('5. Submitting Form...');
    // wait for captcha text input
    await page.waitForSelector('#captchaText');
    await page.type('#captchaText', captchaText);
    await page.keyboard.press('Enter');
    
    console.log('Waiting for navigation after submit...');
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => console.log('Navigation timeout, maybe already loaded'));

    const cookies = await page.cookies();
    const jsessionid = cookies.find(c => c.name === 'JSESSIONID');
    console.log('Got JSESSIONID:', jsessionid?.value);
  } catch (error: any) {
    console.error('An error occurred:', error.message);
  } finally {
    await browser.close();
  }
}
run();
