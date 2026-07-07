import axios from "axios";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";
import { PrismaService } from "../prisma/prisma.service";
import { ScrapeResult, ScrapeStatus, TenderSchema } from "./types";
import { randomDelay } from "./queue";
import { SessionService } from "./session.service";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const STATE_URL =
  "https://tendersodisha.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page";

export async function scrapeStateTenders(
  prisma: PrismaService,
  sessionService: SessionService,
  target: { name: string; url: string },
  source: string = "AUTO",
  getStatus: () => ScrapeStatus = () => 'RUNNING',
  onProgress?: (found: number, added: number) => void
): Promise<ScrapeResult> {
  const targetRegion = target.name;
  let newTendersCount = 0;
  
  // Extract base domain (e.g. https://tendersodisha.gov.in)
  const baseUrlMatch = target.url.match(/^(https?:\/\/[^\/]+)/);
  const baseUrl = baseUrlMatch ? baseUrlMatch[1] : target.url.split('/nicgep')[0];

  try {
    console.log(`[NICGEP] Fetching valid session for ${target.name} via SessionService...`);
    const cookieStr = await sessionService.getValidSessionCookie();
    
    if (!cookieStr) {
      console.warn(`[NICGEP] Warning: Could not obtain a valid session. Scraping may fail or be blocked by Captcha.`);
    }

    console.log(`[NICGEP] Fetching organisation tenders table for ${target.name}...`);
    const tenderRes = await axios.get(
      `${baseUrl}/nicgep/app?component=%24DirectLink&page=FrontEndTendersByOrganisation&service=direct&session=T&sp`,
      {
        headers: {
          "User-Agent": USER_AGENT,
          Cookie: cookieStr || "",
        },
      }
    );

    // Save any newly returned load balancing / session cookies
    sessionService.updateCookiesFromHeaders(tenderRes.headers['set-cookie']);

    const $ = cheerio.load(tenderRes.data);
    const rows = $("table#table tr.even, table#table tr.odd").toArray();

    if (rows.length === 0) {
      console.log("[NICGEP] No rows found. Session might be invalid or table empty.");
      return { district: targetRegion, success: false, tenders: [] };
    }

    console.log(`[NICGEP] Found ${rows.length} tenders. Processing...`);
    const allValidTenders: any[] = [];

    const limitCount = source === "TEST" ? 10 : rows.length;
    for (let i = 0; i < limitCount; i++) {
      let currentStatus = getStatus();
      if (currentStatus === 'STOPPED') {
        console.log("[NICGEP] Scraper stopped.");
        break;
      }
      while (currentStatus === 'PAUSED') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        currentStatus = getStatus();
        if (currentStatus === 'STOPPED') break;
      }
      if (currentStatus === 'STOPPED') break;
      
      const row = rows[i];
      const tds = $(row).find("td");
      if (tds.length < 6) continue;

      const publishedDateStr = $(tds[1]).text().trim();
      const closingDateStr = $(tds[2]).text().trim();
      const openingDateStr = $(tds[3]).text().trim();

      const titleCell = $(tds[4]);
      const fullTitle = titleCell.find("a.Xwb").text().trim() || titleCell.text().trim();
      const cleanTitle = fullTitle.replace(/[\n\t\r]+/g, " ").trim();
      const orgChain = $(tds[5]).text().trim();
      const orgName = orgChain || "State Tenders";

      let href = titleCell.find("a").attr("href");
      const detailUrl = href
        ? href.startsWith("http")
          ? href.replace(/&amp;/g, "&")
          : baseUrl + href.replace(/&amp;/g, "&")
        : `${baseUrl}/nicgep/app?page=FrontEndTendersByOrganisation&service=page` + "&fallback=" + i;

      // Extract a stable Tender ID to prevent duplicates when sessions expire
      const tenderIdMatch = cleanTitle.match(/\[([0-9]{4}_[A-Z0-9]+_[0-9]+_[0-9]+)\]/);
      const tenderId = tenderIdMatch ? tenderIdMatch[1] : null;
      const stableUrl = tenderId 
        ? `${baseUrl}/tender/${tenderId}` 
        : `${baseUrl}/tender/hash-${Buffer.from(cleanTitle).toString('base64').substring(0, 20)}`;

      if (i > 0 && i % 100 === 0) {
        console.log(`[NICGEP] Processed ${i}/${rows.length} tenders...`);
      }

      // Optimization: Check DB first using stable unique identifier
      const existing = await prisma.tender.findUnique({
        where: { sourceUrl: stableUrl },
      });

      // If it exists AND has the deep scraped fields (emd), check if PDF is downloaded
      if (existing && existing.emd !== null) {
        // Check if the PDF file already exists on disk
        const pdfPath = path.join(process.cwd(), 'downloads', `tender_${existing.id}.pdf`);
        if (!fs.existsSync(pdfPath) && href) {
          // PDF not downloaded yet — use the FRESH detail URL from current session to download
          console.log(`[NICGEP] Downloading missing PDF for existing tender ${existing.id}...`);
          try {
            await sessionService.downloadDocumentWithCaptcha(detailUrl, existing.id);
          } catch (dlErr: any) {
            console.error(`[NICGEP] PDF download failed for ${existing.id}:`, dlErr.message);
          }
        }
        if (onProgress) onProgress(1, 0);
        continue;
      }

      let emd: string | null = null;
      let tenderValue: string | null = null;
      let applicationCost: string | null = null;
      let bidSubmissionStartDate: string | null = null;
      let bidSubmissionEndDate: string | null = null;
      let bidOpeningDate: string | null = null;
      let workDescription: string | null = null;
      let noticePdfUrl: string | null = null;
      let tenderPdfUrl: string | null = null;

      if (href) {
        console.log(
          `[NICGEP] Fetching details for [${i + 1}/${rows.length}]: ${cleanTitle.substring(0, 40)}...`
        );

        try {
          // Re-fetch the latest cookie string from SessionService (which now contains merged/updated cookies)
          const activeCookieStr = await sessionService.getValidSessionCookie();

          const detailRes = await axios.get(detailUrl, {
            headers: { "User-Agent": USER_AGENT, Cookie: activeCookieStr || "" },
          });

          // Save any newly returned load balancing / session cookies
          sessionService.updateCookiesFromHeaders(detailRes.headers['set-cookie']);

          const $d = cheerio.load(detailRes.data);
          const data: Record<string, string> = {};

          $d(".td_caption").each((idx, el) => {
            const key = $d(el).text().replace(/\s+/g, " ").trim();
            const nextTd = $d(el).next("td");
            if (nextTd.length) {
              const val = nextTd.text().replace(/\s+/g, " ").trim();
              data[key] = val;
              if (key === "Work Description") {
                workDescription = val;
              }
            }
          });

          emd = data["EMD Amount in ₹"] || null;
          tenderValue = data["Tender Value in ₹"] || null;
          applicationCost = data["Tender Fee in ₹"] || null;
          bidSubmissionStartDate = data["Bid Submission Start Date"] || null;
          bidSubmissionEndDate = data["Bid Submission End Date"] || null;
          bidOpeningDate = data["Bid Opening Date"] || null;

          // Extract individual PDF URLs from the tables
          $d("table a").each((i, el) => {
            const linkHref = $d(el).attr('href') || "";
            const linkText = $d(el).text().toLowerCase();
            
            // If it's a DirectLink, assume it's a document link (NICGEP often hides .pdf)
            if (linkHref.includes('component=%24DirectLink')) {
              let fullLink = linkHref;
              if (!linkHref.startsWith('http')) {
                 if (linkHref.startsWith('/')) {
                   fullLink = `${baseUrl}${linkHref}`;
                 } else {
                   fullLink = `${baseUrl}/nicgep/${linkHref}`;
                 }
              }
              
              if (linkText.includes('notice') || linkText.includes('nit')) {
                noticePdfUrl = fullLink;
              } else {
                // If it's another PDF, store it as the tender PDF
                tenderPdfUrl = fullLink;
              }
            }
          });
          
          if (workDescription && workDescription !== "Please refer Tender documents.") {
             data["_workDescription"] = workDescription;
          }

          await randomDelay(800, 1500);
        } catch (detailErr: any) {
          console.error(
            `[NICGEP] Failed to fetch detail page for ${cleanTitle}:`,
            detailErr.message
          );
          if (axios.isAxiosError(detailErr) && detailErr.response?.status === 302) {
            throw new Error("Session Expired during detail fetch");
          }
        }
      }

      const finalStartDate = bidSubmissionStartDate
        ? new Date(bidSubmissionStartDate)
        : openingDateStr
        ? new Date(openingDateStr)
        : new Date(publishedDateStr);
      const finalEndDate = bidSubmissionEndDate
        ? new Date(bidSubmissionEndDate)
        : new Date(closingDateStr);

      const openingDesc = bidOpeningDate
        ? `Bid Opening: ${bidOpeningDate}`
        : `Opening Date: ${openingDateStr}`;
      
      // Use real description if fetched, else fallback to dates
      let description = (workDescription && workDescription !== "Please refer Tender documents.") 
        ? workDescription 
        : `${openingDesc} | Published: ${publishedDateStr}`;

      const tenderObj = {
        district: orgName,
        title: cleanTitle,
        description, // We will overwrite this if workDescription is found inside the loop
        startDate: finalStartDate,
        endDate: finalEndDate,
        sourceUrl: stableUrl, // Use stable identifier instead of ephemeral session URL
        emd,
        tenderValue,
        applicationCost,
      };

      let validData: any = null;
      const validation = TenderSchema.safeParse(tenderObj);
      if (validation.success) {
        validData = validation.data;
      } else {
        try {
          const fallbackTender = {
            ...tenderObj,
            startDate: new Date(),
            endDate: new Date(),
          };
          const fallbackValidation = TenderSchema.safeParse(fallbackTender);
          if (fallbackValidation.success) {
            validData = fallbackValidation.data;
          }
        } catch (e) {}
      }

      if (validData) {
        allValidTenders.push(validData);
        try {
          const savedTender = await prisma.tender.upsert({
            where: { sourceUrl: stableUrl },
            update: {
              // Ensure we don't accidentally overwrite a good description with a date string
              startDate: validData.startDate,
              endDate: validData.endDate,
              emd: validData.emd,
              tenderValue: validData.tenderValue,
              applicationCost: validData.applicationCost,
            },
            create: {
              state: targetRegion, // Fix: Use the dynamic target region instead of hardcoded 'Odisha'
              level: "STATE",
              organisation: validData.district,
              title: validData.title,
              description: validData.description,
              startDate: validData.startDate,
              endDate: validData.endDate,
              // Only fallback to detailUrl if we completely failed to find the PDF link
              noticePdfUrl: noticePdfUrl || validData.noticePdfUrl || detailUrl, 
              tenderPdfUrl: tenderPdfUrl || validData.tenderPdfUrl || "",
              sourceUrl: stableUrl,
              emd: validData.emd,
              tenderValue: validData.tenderValue,
              applicationCost: validData.applicationCost,
            },
          });
          
          // Download PDF via fresh detail page
          if (href) {
             await sessionService.downloadDocumentWithCaptcha(detailUrl, savedTender.id);
          }

          newTendersCount++;
          if (onProgress) onProgress(1, 1);
        } catch (dbError) {
          console.error(`[DB Error NICGEP]`, dbError);
        }
      } else {
         if (onProgress && validData) onProgress(1, 0);
      }
    }

    console.log(`[NICGEP] Finished. Added/Updated ${newTendersCount} tenders.`);

    await prisma.scrapeLog.create({
      data: {
        targetRegion,
        status: "SUCCESS",
        tendersFound: allValidTenders.length,
        source,
      },
    });

    return {
      district: targetRegion,
      success: true,
      tenders: allValidTenders,
      newTendersCount,
    };
  } catch (error) {
    console.error(`[Scraper Error] Failed to scrape NICGEP State Tenders:`, error);

    await prisma.scrapeLog.create({
      data: {
        targetRegion,
        status: "FAILED",
        tendersFound: 0,
        error: error instanceof Error ? error.message : "Unknown error",
        source,
      },
    });

    return {
      district: targetRegion,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      tenders: [],
      newTendersCount,
    };
  }
}
