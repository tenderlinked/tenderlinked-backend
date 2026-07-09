import { PrismaClient, ScraperTarget } from "@prisma/client";
import { ScrapeResult, ScrapeStatus } from "./types";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { SessionService } from "./session.service";

puppeteer.use(StealthPlugin());

export async function scrapeApStateTenders(
  prisma: PrismaClient,
  sessionService: SessionService,
  target: ScraperTarget,
  source: string = "AUTO",
  getStatus: () => ScrapeStatus = () => "RUNNING",
  onProgress?: (found: number, added: number) => void
): Promise<ScrapeResult> {
  const targetRegion = target.name;
  let newTendersCount = 0;

  console.log(`[AP-eProcurement] Starting scraper for ${targetRegion}`);

  // Resolve Region IDs
  let regionStateId: string | null = target.regionStateId || null;
  let regionDistrictId: string | null = target.regionDistrictId || null;
  
  if (!regionStateId) {
    const dbState = await prisma.regionState.findFirst({
      where: { name: { contains: targetRegion, mode: "insensitive" } }
    });
    if (dbState) regionStateId = dbState.id;
  }
  
  if (!regionDistrictId && target.type === 'DISTRICT') {
    const dbDistrict = await prisma.regionDistrict.findFirst({
      where: { name: { contains: targetRegion, mode: "insensitive" } }
    });
    if (dbDistrict) regionDistrictId = dbDistrict.id;
  }

  const browser = await puppeteer.launch({
    headless: "shell",
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--disable-features=IsolateOrigins,site-per-process'],
  });

  const parseAPDate = (dateStr: string) => {
      if (!dateStr) return null;
      // Format is DD/MM/YYYY hh:mm AM/PM
      // Using regex to reliably extract parts
      const match = dateStr.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})\s+(AM|PM)$/i);
      if (match) {
          const day = parseInt(match[1], 10);
          const month = parseInt(match[2], 10) - 1;
          const year = parseInt(match[3], 10);
          let hour = parseInt(match[4], 10);
          const minute = parseInt(match[5], 10);
          const ampm = match[6].toUpperCase();
          if (ampm === 'PM' && hour < 12) hour += 12;
          if (ampm === 'AM' && hour === 12) hour = 0;
          const dt = new Date(year, month, day, hour, minute);
          if (!isNaN(dt.getTime())) return dt;
      }
      return null;
  };

  const allValidTenders: any[] = [];

  try {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    console.log(`[AP-eProcurement] Navigating to ${target.url}...`);
    await page.goto(target.url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Handle APThanksIndia popup if it exists (close button)
    try {
      const closeButtonSelector = 'button.close, .close, [aria-label="Close"], #closeBtn';
      await page.waitForSelector(closeButtonSelector, { timeout: 5000 });
      console.log(`[AP-eProcurement] Popup detected. Closing...`);
      await page.click(closeButtonSelector);
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      console.log(`[AP-eProcurement] No popup detected or couldn't find close button.`);
    }
    
    const currentUrl = page.url();
    if (currentUrl.includes("login.html")) {
        console.log(`[AP-eProcurement] Clicking 'More...' button to load active tenders...`);
        
        // Wait briefly to ensure AP portal Javascript is fully attached before clicking
        await new Promise(r => setTimeout(r, 2000));
        
        try {
            await page.evaluate(() => {
                const moreBtn = document.querySelector('#viewCurrentall') as HTMLElement;
                if (moreBtn) moreBtn.click();
            });
            // Give it a moment to initiate the request
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
            console.log(`[AP-eProcurement] Fallback to direct navigation after clicking more... error:`, (e as Error).message);
            const baseUrl = currentUrl.match(/^(https?:\/\/[^/]+)/)?.[1] || "https://tender.apeprocurement.gov.in";
            await page.goto(`${baseUrl}/TenderDetailsHome.html`, { waitUntil: 'networkidle2', timeout: 60000 });
        }
    } else if (!currentUrl.includes("TenderDetailsHome.html")) {
        const baseUrl = currentUrl.match(/^(https?:\/\/[^/]+)/)?.[1] || "https://tender.apeprocurement.gov.in";
        await page.goto(`${baseUrl}/TenderDetailsHome.html`, { waitUntil: 'networkidle2', timeout: 60000 });
    }

    // Wait for the main tender table to load
    try {
        await page.waitForSelector('#pagetable13', { timeout: 30000 });
        console.log(`[AP-eProcurement] Tender table loaded.`);
    } catch (err) {
        console.log(`[AP-eProcurement] Failed to find #pagetable13. Saving debug page...`);
        const fs = require('fs');
        fs.writeFileSync('ap_scraper_failed.html', await page.content());
        await page.screenshot({ path: 'ap_scraper_failed.png', fullPage: true });
        throw err;
    }

    // Note: Due to the complexity of the new window flow, we will extract basic row info first.
    // In a full implementation, we'd iterate rows, click the "View Details" icon, wait for the new target, extract data, and close it.
    
    let hasNextPage = true;
    let pageNum = 1;

    while (hasNextPage) {
        let currentStatus = getStatus();
        if (currentStatus === "STOPPED") break;

        console.log(`[AP-eProcurement] Scraping page ${pageNum}...`);

        // For now, let's extract the rows from the current table
        const rowsData = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('#pagetable13 tbody tr'));
            return rows.map((tr, index) => {
                const tds = tr.querySelectorAll('td');
                if (tds.length < 8) return null;
                // Extract click action for the details icon
                const actionTd = tds[tds.length - 1];
                let downloadScript = '';
                let detailsScript = '';
                if (actionTd) {
                    const allClickables = Array.from(actionTd.querySelectorAll('[onclick]'));
                    
                    for (const el of allClickables) {
                        const onclick = el.getAttribute('onclick') || '';
                        const onclickLower = onclick.toLowerCase();
                        const htmlLower = el.innerHTML.toLowerCase();
                        const srcLower = el.getAttribute('src')?.toLowerCase() || '';
                        
                        const isDoc = onclickLower.includes('doc') || htmlLower.includes('doc') || srcLower.includes('doc') || onclickLower.includes('download') || onclickLower.includes('zip');
                        const isView = onclickLower.includes('view') || htmlLower.includes('view') || srcLower.includes('view') || onclickLower.includes('detail') || onclickLower.includes('show');
                        
                        // Prefer heuristics
                        if (isDoc) downloadScript = onclick;
                        else if (isView) detailsScript = onclick;
                    }
                    
                    // Fallback positional assignment if heuristics fail
                    if (!detailsScript && !downloadScript && allClickables.length >= 2) {
                        detailsScript = allClickables[0].getAttribute('onclick') || '';
                        downloadScript = allClickables[1].getAttribute('onclick') || '';
                    }
                }

                return {
                    index,
                    department: tds[0]?.textContent?.trim() || '',
                    tenderId: tds[1]?.textContent?.trim() || '',
                    tenderNoticeNumber: tds[2]?.textContent?.trim() || '',
                    tenderCategory: tds[3]?.textContent?.trim() || '',
                    title: tds[4]?.textContent?.trim() || '',
                    estimatedValue: tds[5]?.textContent?.trim() || '',
                    startDate: tds[6]?.textContent?.trim() || '',
                    closingDate: tds[7]?.textContent?.trim() || '',
                    downloadScript,
                    detailsScript,
                };
            }).filter(Boolean);
        });

        console.log(`[AP-eProcurement] Extracted ${rowsData.length} rows from page ${pageNum}.`);

        for (const row of rowsData) {
            if (!row) continue;
            let loopStatus = getStatus();
            if (loopStatus === "STOPPED") break;

            // Process data
            const tenderObj = {
                state: targetRegion,
                regionStateId: regionStateId,
                regionDistrictId: regionDistrictId,
                level: "STATE",
                organisation: row.department,
                tenderId: row.tenderId,
                tenderRefNumber: row.tenderNoticeNumber,
                tenderCategory: row.tenderCategory,
                title: row.title,
                tenderValue: row.estimatedValue,
                startDate: parseAPDate(row.startDate),
                endDate: parseAPDate(row.closingDate),
                sourceUrl: page.url(),
            };

            try {
                // Skip logic to avoid processing already fully-downloaded tenders
                const existing = await prisma.tender.findUnique({ where: { tenderId: row.tenderId } });
                if (existing && existing.documentsDownloaded) {
                    if (onProgress) onProgress(1, 0);
                    continue;
                }

                const savedTender = await prisma.tender.upsert({
                    where: { tenderId: row.tenderId },
                    update: {
                        sourceUrl: tenderObj.sourceUrl,
                        startDate: tenderObj.startDate,
                        endDate: tenderObj.endDate,
                        tenderValue: tenderObj.tenderValue,
                        tenderRefNumber: tenderObj.tenderRefNumber,
                        tenderCategory: tenderObj.tenderCategory,
                        title: tenderObj.title,
                        organisation: tenderObj.organisation,
                    },
                    create: {
                        state: tenderObj.state,
                        regionStateId: tenderObj.regionStateId,
                        regionDistrictId: tenderObj.regionDistrictId,
                        level: "STATE",
                        organisation: tenderObj.organisation,
                        title: tenderObj.title,
                        startDate: tenderObj.startDate,
                        endDate: tenderObj.endDate,
                        tenderValue: tenderObj.tenderValue,
                        tenderId: tenderObj.tenderId,
                        tenderRefNumber: tenderObj.tenderRefNumber,
                        tenderCategory: tenderObj.tenderCategory,
                        sourceUrl: tenderObj.sourceUrl,
                    }
                });
                
                let finalTenderCode = savedTender.tenderCode;
                if (!finalTenderCode && savedTender.localId) {
                    const st = targetRegion.substring(0, 2).toUpperCase();
                    finalTenderCode = `TL-${st}-${String(savedTender.localId).padStart(6, '0')}`;
                    await prisma.tender.update({
                        where: { id: savedTender.id },
                        data: { tenderCode: finalTenderCode }
                    });
                }

                allValidTenders.push(savedTender);
                newTendersCount++;
                if (onProgress) onProgress(1, 1);

                // Scrape Details Page
                if (row.detailsScript) {
                    console.log(`[AP-eProcurement] Scraping details page for ${row.tenderId}...`);
                    const detailsPagePromise = new Promise<any>((resolve) => {
                        const handler = async (target: any) => {
                            const newPage = await target.page();
                            if (newPage) {
                                browser.off('targetcreated', handler);
                                resolve(newPage);
                            }
                        };
                        browser.on('targetcreated', handler);
                        setTimeout(() => {
                            browser.off('targetcreated', handler);
                            resolve(null);
                        }, 60000);
                    });
                    
                    await page.evaluate((script) => {
                        try { eval(script); } catch(e) {}
                    }, row.detailsScript);

                    const detailsPage = await detailsPagePromise;
                    if (detailsPage) {
                        try {
                            await detailsPage.waitForSelector('body', { timeout: 30000 });
                            await new Promise(r => setTimeout(r, 2000));
                            
                            const detailsExtracted = await detailsPage.evaluate(() => {
                                const extracted: Record<string, string> = {};
                                document.querySelectorAll('table').forEach((table) => {
                                    table.querySelectorAll('tr').forEach((tr) => {
                                        const tds = tr.querySelectorAll('td');
                                        if (tds.length === 2) {
                                            const k = tds[0].textContent?.replace(/\s+/g, ' ').trim() || '';
                                            const v = tds[1].textContent?.replace(/\s+/g, ' ').trim() || '';
                                            if (k) extracted[k] = v;
                                        } else if (tds.length === 4) {
                                            const k1 = tds[0].textContent?.replace(/\s+/g, ' ').trim() || '';
                                            const v1 = tds[1].textContent?.replace(/\s+/g, ' ').trim() || '';
                                            const k2 = tds[2].textContent?.replace(/\s+/g, ' ').trim() || '';
                                            const v2 = tds[3].textContent?.replace(/\s+/g, ' ').trim() || '';
                                            if (k1) extracted[k1] = v1;
                                            if (k2) extracted[k2] = v2;
                                        } else if (tds.length === 6) {
                                            const h1 = tds[0].textContent?.trim() || '';
                                            if (h1.toLowerCase() === 'sno' || h1.toLowerCase() === '1') {
                                                const state = tds[1].textContent?.trim() || '';
                                                const district = tds[2].textContent?.trim() || '';
                                                if (state && district && district.toLowerCase() !== 'district') {
                                                    extracted['State'] = state;
                                                    extracted['District'] = district;
                                                    extracted['City'] = tds[3].textContent?.trim() || '';
                                                }
                                            }
                                        }
                                    });
                                });
                                return extracted;
                            });
                            
                            const updateData: any = {};
                            for (const [key, val] of Object.entries(detailsExtracted)) {
                                if (key.includes('Transaction Fee') || key.includes('Tender Fee') || key.includes('Cost of')) {
                                    updateData.applicationCost = val;
                                } else if (key === 'Bid Security (INR)' || key === 'EMD') {
                                    updateData.emd = val;
                                } else if (key === 'Bid Security In Favour Of') {
                                    updateData.emdPayableTo = val;
                                } else if (key === 'Mode of Payment') {
                                    updateData.paymentMode = val;
                                } else if (key === 'Officer Inviting Bids' || key === 'Officer Inviting') {
                                    updateData.invitingAuthorityName = val;
                                } else if (key === 'Type of Work' || key === 'Tender Type') {
                                    updateData.tenderType = val;
                                } else if (key === 'Form Of Contract') {
                                    updateData.formOfContract = val;
                                } else if (key === 'Name of Work') {
                                    updateData.description = val;
                                } else if (key === 'State') {
                                    updateData.state = val;
                                } else if (key === 'District') {
                                    updateData.district = val;
                                } else if (key === 'City') {
                                    updateData.city = val;
                                } else if (key === 'Address') {
                                    updateData.invitingAuthorityAddress = val;
                                } else if (key === 'Contact Details') {
                                    // Prisma Tender schema has no phoneNumber field, ignore or append to address manually
                                } else if (key === 'Department Name') {
                                    updateData.organisation = val;
                                } else if (key === 'Bid Validity Period (in Days)') {
                                    const parsed = parseInt(val as string, 10);
                                    if (!isNaN(parsed)) updateData.bidValidityDays = parsed;
                                } else if (key === 'Period of Completion/ Delivery Period (in months)') {
                                    const parsed = parseInt(val as string, 10);
                                    if (!isNaN(parsed)) updateData.periodOfWorkDays = parsed * 30; // convert months to days approx
                                }
                            }
                            
                            if (Object.keys(updateData).length > 0) {
                                await prisma.tender.update({
                                    where: { tenderId: row.tenderId },
                                    data: updateData
                                });
                            }
                        } catch (e) {
                            console.error(`[AP-eProcurement] Failed to scrape details for ${row.tenderId}`, (e as Error).message);
                        } finally {
                            await detailsPage.close();
                        }
                    }
                }

                // Document downloading
                if (row.downloadScript) {
                    console.log(`[AP-eProcurement] Downloading documents for ${row.tenderId}...`);
                    const dlPagePromise = new Promise<any>((resolve) => {
                        const handler = async (target: any) => {
                            const newPage = await target.page();
                            if (newPage) {
                                browser.off('targetcreated', handler);
                                resolve(newPage);
                            }
                        };
                        browser.on('targetcreated', handler);
                        setTimeout(() => {
                            browser.off('targetcreated', handler);
                            resolve(null);
                        }, 60000);
                    });
                    
                    await page.evaluate((script) => {
                        try { eval(script); } catch(e) {}
                    }, row.downloadScript);

                    const newPage = await dlPagePromise;
                    if (newPage) {
                        try {
                            const path = require('path');
                            const fs = require('fs');
                            const downloadDir = path.join(process.cwd(), 'downloads', target.name, row.tenderId);
                            if (!fs.existsSync(downloadDir)) {
                                fs.mkdirSync(downloadDir, { recursive: true });
                            }

                            const cdp = await newPage.target().createCDPSession();
                            await cdp.send('Page.setDownloadBehavior', {
                                behavior: 'allow',
                                downloadPath: downloadDir
                            });

                            await newPage.waitForSelector('button, input[type="button"], input[type="submit"]', { timeout: 30000 });
                            
                            await newPage.evaluate(() => {
                                const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
                                const bulkBtn = buttons.find(b => (b.textContent && b.textContent.includes('Bulk DownLoad')) || ((b as any).value && (b as any).value.includes('Bulk DownLoad')));
                                if (bulkBtn) (bulkBtn as HTMLElement).click();
                            });

                            // Wait for download to finish
                            let retries = 30;
                            let downloaded = false;
                            while (retries > 0) {
                                await new Promise(r => setTimeout(r, 1000));
                                const files = fs.readdirSync(downloadDir);
                                const crdownload = files.find((f: string) => f.endsWith('.crdownload'));
                                if (files.length > 0 && !crdownload) {
                                    downloaded = true;
                                    break;
                                }
                                retries--;
                            }
                            
                            if (downloaded) {
                                await prisma.tender.update({
                                    where: { id: savedTender.id },
                                    data: { documentsDownloaded: true }
                                });
                            }
                        } catch (e) {
                            console.error(`[AP-eProcurement] Failed to download documents for ${row.tenderId}`, (e as Error).message);
                        } finally {
                            await newPage.close();
                        }
                    }
                }

            } catch (dbErr) {
                console.error(`[AP-eProcurement] Error saving tender ${row.tenderId}`, dbErr);
            }
        }

        // Check for Next button
        hasNextPage = await page.evaluate(() => {
            const nextBtn = document.querySelector('#pagetable13_next') as HTMLElement;
            if (!nextBtn) return false;
            // Check if it's disabled (DataTables often applies .disabled to the button itself or the wrapping <li>)
            if (nextBtn.classList.contains('disabled') || nextBtn.classList.contains('ui-state-disabled')) {
                return false;
            }
            if (nextBtn.parentElement && nextBtn.parentElement.classList.contains('disabled')) {
                return false;
            }
            
            nextBtn.click();
            return true;
        });

        if (hasNextPage) {
            // Wait for the table data to refresh via AJAX.
            await new Promise(r => setTimeout(r, 2500));
            pageNum++;
        }
    }

  } catch (error) {
      console.error(`[AP-eProcurement] Fatal Error`, error);
  } finally {
      await browser.close();
  }

  return {
    district: targetRegion,
    success: true,
    tenders: allValidTenders,
    newTendersCount
  };
}
