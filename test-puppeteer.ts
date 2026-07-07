import puppeteer from 'puppeteer';
import * as path from 'path';

async function run() {
  console.log("Launching Puppeteer...");
  const browser = await puppeteer.launch({ 
    headless: true, // Use true for background execution
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  
  try {
    const page = await browser.newPage();
    
    // Set a realistic viewport and user agent
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log("1. Navigating to Latest Active Tenders...");
    await page.goto('https://tendersodisha.gov.in/nicgep/app?page=FrontEndLatestActiveTenders&service=page', { waitUntil: 'networkidle2' });

    console.log("2. Clicking on the first tender...");
    // Let's take a screenshot of the list page to see what's there
    await page.screenshot({ path: path.join(__dirname, 'debug-list.png') });
    console.log("Saved debug-list.png");

    // Find the first link that goes to FrontEndViewTender
    await page.waitForSelector("a[id*='DirectLink']", { timeout: 10000 });
    
    // Click and wait for navigation
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click("a[id*='DirectLink']")
    ]);

    console.log("3. Clicking 'Download as Zip'...");
    // Look for the docDownload link or a link containing 'Download as zip'
    const downloadSelector = 'a[id="docDownload"], a[title="Download as zip"]';
    await page.waitForSelector(downloadSelector);
    
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click(downloadSelector)
    ]);

    console.log("4. Looking for Captcha image...");
    await page.waitForSelector('img#captchaImage', { timeout: 10000 });
    
    const captchaElement = await page.$('img#captchaImage');
    if (captchaElement) {
      const outputPath = path.join(__dirname, 'captcha-puppeteer.png');
      // Puppeteer can screenshot the specific element directly!
      await captchaElement.screenshot({ path: outputPath });
      console.log(`\nSUCCESS! Captcha image captured and saved to: ${outputPath}`);
    } else {
      console.error("Captcha element not found on page.");
    }

  } catch (error: any) {
    console.error("An error occurred during Puppeteer execution:", error.message);
  } finally {
    console.log("Closing browser...");
    await browser.close();
  }
}

run();
