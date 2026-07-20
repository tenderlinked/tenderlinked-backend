import { PrismaClient } from '@prisma/client';
import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';

const prisma = new PrismaClient();

function norm(str: string | undefined): string | null {
  if (!str) return null;
  const cleaned = str.replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned === '' || cleaned.toLowerCase() === 'na' || cleaned.toLowerCase() === 'null' ? null : cleaned;
}

async function main() {
  const tenders = await prisma.tender.findMany({
    where: { 
      state: { in: ['Odisha', 'West Bengal'] },
    },
    select: { id: true, tenderId: true, state: true }
  });

  console.log(`Found ${tenders.length} tenders to process.`);

  const browser = await puppeteer.launch({ 
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'] 
  });
  
  const BATCH_SIZE = 5; // Reduced batch size slightly to prevent memory/timeout issues
  
  for (let i = 0; i < tenders.length; i += BATCH_SIZE) {
    const batch = tenders.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${i/BATCH_SIZE + 1}/${Math.ceil(tenders.length/BATCH_SIZE)}`);
    
    await Promise.all(batch.map(async (tender) => {
      if (!tender.tenderId) return;
      const baseUrl = tender.state === 'Odisha' 
        ? 'https://tendersodisha.gov.in/nicgep/app' 
        : 'https://tenders.wb.gov.in/nicgep/app';
        
      const page = await browser.newPage();
      
      // Block images/css to speed up
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
          req.abort();
        } else {
          req.continue();
        }
      });
      
      try {
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        
        // 1. Search directly on the homepage using the main "Tender Search" box
        const searchInputs = await page.$$('input[type="text"]');
        if (searchInputs.length > 0) {
          // Type into the first text input (which is the Tender Search on the homepage)
          await searchInputs[0].type(tender.tenderId);
        } else {
          throw new Error("Could not find search input on homepage");
        }
        
        // Click the 'Go' or 'Search' button next to it
        const searchBtns = await page.$$("::-p-xpath(//input[@value='Go' or @value='Search' or @type='submit' or @type='image'])");
        if (searchBtns.length > 0) {
           await (searchBtns[0] as any).click();
           await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 });
        } else {
           throw new Error("Could not find Go button");
        }
        
        // 2. Click the first tender link in results
        // 2. Click the first tender link in results (must be DirectLink_ to avoid clicking 'Back')
        const tenderLinks = await page.$$("::-p-xpath(//td//a[contains(@id, 'DirectLink_')])");
        if (tenderLinks.length > 0) {
           await (tenderLinks[0] as any).click();
           await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 });
        } else {
           throw new Error("Could not find tender link in results (may not exist or expired)");
        }
        
        // 3. We are on detail page! Extract table data
        const html = await page.content();
        const $ = cheerio.load(html);
        
        const details: Record<string, string> = {};
        $('table').each((_, table) => {
          $(table).find('tr').each((_, tr) => {
            const cells = $(tr).find('td');
            for (let j = 0; j < cells.length; j += 2) {
              const key = $(cells[j]).text().replace(/\s+/g, ' ').trim();
              const value = $(cells[j + 1]).text().replace(/\s+/g, ' ').trim();
              if (key && value) {
                details[key] = value;
              }
            }
          });
        });
        
        const tenderCategory = norm(details['Tender Category']);
        const productCategory = norm(details['Product Category']);
        
        if (tenderCategory) {
          await prisma.tender.update({
            where: { id: tender.id },
            data: { tenderCategory, productCategory }
          });
          console.log(`✅ ${tender.tenderId}: TC=${tenderCategory}, PC=${productCategory}`);
        } else {
           console.log(`❌ Could not extract details for ${tender.tenderId}`);
        }
      } catch (e: any) {
        console.log(`⚠️ Error processing ${tender.tenderId}: ${e.message}`);
      } finally {
        await page.close();
      }
    }));
  }

  await browser.close();
  console.log("Done.");
}

main().catch(console.error);
