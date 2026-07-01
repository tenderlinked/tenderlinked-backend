import axios from "axios";
import * as cheerio from "cheerio";
import { PrismaService } from "../prisma/prisma.service";
import { ScrapeResult, TenderSchema } from "./types";
import { randomDelay } from "./queue";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const STATE_URL =
  "https://tendersodisha.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page";

export async function scrapeStateTenders(
  prisma: PrismaService,
  source: string = "AUTO",
  isPaused: () => boolean = () => false
): Promise<ScrapeResult> {
  const targetRegion = "State Level"; // Logical district name for logging
  let newTendersCount = 0;
  try {
    console.log("[NICGEP] Fetching homepage to initialize session...");
    const sessionRes = await axios.get("https://tendersodisha.gov.in/nicgep/app", {
      headers: { "User-Agent": USER_AGENT },
    });

    const cookies = sessionRes.headers["set-cookie"];
    const cookieStr = cookies ? cookies.map((c: string) => c.split(";")[0]).join("; ") : "";

    console.log("[NICGEP] Fetching organisation tenders table...");
    const tenderRes = await axios.get(
      "https://tendersodisha.gov.in/nicgep/app?component=%24DirectLink&page=FrontEndTendersByOrganisation&service=direct&session=T&sp",
      {
        headers: {
          "User-Agent": USER_AGENT,
          Cookie: cookieStr,
        },
      }
    );

    const $ = cheerio.load(tenderRes.data);
    const rows = $("table#table tr.even, table#table tr.odd").toArray();

    if (rows.length === 0) {
      console.log("[NICGEP] No rows found. Session might be invalid or table empty.");
      return { district: targetRegion, success: false, tenders: [] };
    }

    console.log(`[NICGEP] Found ${rows.length} tenders. Processing...`);
    const allValidTenders: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      if (isPaused()) {
        console.log("[NICGEP] Scraper paused/stopped.");
        break;
      }
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
          : "https://tendersodisha.gov.in" + href.replace(/&amp;/g, "&")
        : STATE_URL + "&fallback=" + i;

      // Optimization: Check DB first using unique sourceUrl
      const existing = await prisma.tender.findUnique({
        where: { sourceUrl: detailUrl },
      });

      // If it exists AND has the deep scraped fields (emd), skip it
      if (existing && existing.emd !== null) {
        continue;
      }

      let emd: string | null = null;
      let tenderValue: string | null = null;
      let applicationCost: string | null = null;
      let bidSubmissionStartDate: string | null = null;
      let bidSubmissionEndDate: string | null = null;
      let bidOpeningDate: string | null = null;

      if (href) {
        console.log(
          `[NICGEP] Fetching details for [${i + 1}/${rows.length}]: ${cleanTitle.substring(0, 40)}...`
        );

        try {
          const detailRes = await axios.get(detailUrl, {
            headers: { "User-Agent": USER_AGENT, Cookie: cookieStr },
          });

          const $d = cheerio.load(detailRes.data);
          const data: Record<string, string> = {};

          $d(".td_caption").each((idx, el) => {
            const key = $d(el).text().replace(/\s+/g, " ").trim();
            const nextTd = $d(el).next("td");
            if (nextTd.length) {
              data[key] = nextTd.text().replace(/\s+/g, " ").trim();
            }
          });

          emd = data["EMD Amount in ₹"] || null;
          tenderValue = data["Tender Value in ₹"] || null;
          applicationCost = data["Tender Fee in ₹"] || null;
          bidSubmissionStartDate = data["Bid Submission Start Date"] || null;
          bidSubmissionEndDate = data["Bid Submission End Date"] || null;
          bidOpeningDate = data["Bid Opening Date"] || null;

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
      const description = `${openingDesc} | Published: ${publishedDateStr}`;

      const tenderObj = {
        district: orgName,
        title: cleanTitle,
        description,
        startDate: finalStartDate,
        endDate: finalEndDate,
        sourceUrl: detailUrl,
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
          await prisma.tender.upsert({
            where: { sourceUrl: detailUrl },
            update: {
              description: validData.description,
              startDate: validData.startDate,
              endDate: validData.endDate,
              emd: validData.emd,
              tenderValue: validData.tenderValue,
              applicationCost: validData.applicationCost,
            },
            create: {
              state: "Odisha",
              level: "STATE",
              organisation: validData.district,
              title: validData.title,
              description: validData.description,
              startDate: validData.startDate,
              endDate: validData.endDate,
              noticePdfUrl: validData.noticePdfUrl,
              tenderPdfUrl: validData.tenderPdfUrl || "",
              sourceUrl: validData.sourceUrl,
              emd: validData.emd,
              tenderValue: validData.tenderValue,
              applicationCost: validData.applicationCost,
            },
          });
          newTendersCount++;
        } catch (dbError) {
          console.error(`[DB Error NICGEP]`, dbError);
        }
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
