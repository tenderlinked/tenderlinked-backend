import { Injectable } from "@nestjs/common";
import axios from "axios";
import { PrismaService } from "../prisma/prisma.service";
import { DISTRICTS } from "./districts";
import { scraperLimit, randomDelay } from "./queue";
import { withRetry } from "./retry";
import { parseTenderPage } from "./parser";
import { ScrapeResult, TenderSchema } from "./types";
import { scrapeStateTenders } from "./nicgep-scraper";

const DEFAULT_TIMEOUT = 30000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

@Injectable()
export class ScraperService {
  public isPaused: boolean = false;

  constructor(private readonly prisma: PrismaService) {}

  stopScrape() {
    this.isPaused = true;
    console.log("[ScraperService] Stop signal received.");
  }

  async scrapeDistrict(district: string, source: string = "AUTO"): Promise<ScrapeResult> {
    let page = 0;
    const maxPages = 10;
    let hasMore = true;
    const allValidTenders: any[] = [];
    const seenTitles = new Set<string>();

    try {
      this.isPaused = false; // Reset on start
      while (hasMore && page < maxPages && !this.isPaused) {
        const url = `https://${district}.odisha.gov.in/en/tender?page=${page}`;

        // 1. Fetch with retry and timeout
        const response = await withRetry(async () => {
          return await axios.get(url, {
            timeout: DEFAULT_TIMEOUT,
            headers: {
              "User-Agent": USER_AGENT,
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.5",
            },
          });
        }, 3, 1000);

        // 2. Parse HTML
        const html = response.data;
        const rawTenders = parseTenderPage(html, district, url);

        // If the page has no tender rows, we reached the end
        if (rawTenders.length === 0) {
          hasMore = false;
          break;
        }

        // Check for infinite pagination loops
        let duplicateCount = 0;
        for (const t of rawTenders) {
          if (seenTitles.has(t.title)) {
            duplicateCount++;
          }
          seenTitles.add(t.title);
        }

        if (duplicateCount === rawTenders.length && rawTenders.length > 0) {
          console.warn(
            `[Scraper Warning] District ${district} pagination loop detected at page ${page}. Breaking.`
          );
          hasMore = false;
          break;
        }

        // 3. Validation & Cleanup
        const validTenders = rawTenders.filter((tender) => {
          const result = TenderSchema.safeParse(tender);
          if (!result.success) {
            console.warn(
              `[Validation Error] District: ${district}, Title: ${tender.title}`,
              result.error.issues
            );
            return false;
          }
          return true;
        });

        allValidTenders.push(...validTenders);
        page++;

        // Be polite to the server between pages
        if (hasMore && page < maxPages) {
          await randomDelay(1000, 2000);
        }
      }

      // 4. Database Insertion (Deduplication Layer)
      let newTendersCount = 0;
      for (const tender of allValidTenders) {
        try {
          const existing = await this.prisma.tender.findFirst({
            where: {
              sourceUrl: tender.sourceUrl
            },
          });

          if (!existing) {
            await this.prisma.tender.create({
              data: {
                state: "Odisha",
                level: "DISTRICT",
                district: tender.district,
                title: tender.title,
                description: tender.description,
                startDate: tender.startDate,
                endDate: tender.endDate,
                noticePdfUrl: tender.noticePdfUrl,
                tenderPdfUrl: tender.tenderPdfUrl,
                sourceUrl: tender.sourceUrl,
                aiProcessed: false,
              },
            });
            newTendersCount++;
          }
        } catch (dbError) {
          console.error(`[DB Error] District: ${district}`, dbError);
        }
      }

      await this.prisma.scrapeLog.create({
        data: {
          targetRegion: district,
          status: "SUCCESS",
          tendersFound: allValidTenders.length,
          source,
        },
      });

      return {
        district,
        success: true,
        tenders: allValidTenders,
        newTendersCount,
      };
    } catch (error) {
      console.error(`[Scraper Error] Failed to scrape ${district}:`, error);

      await this.prisma.scrapeLog.create({
        data: {
          targetRegion: district,
          status: "FAILED",
          tendersFound: 0,
          error: error instanceof Error ? error.message : "Unknown error",
          source,
        },
      });

      return {
        district,
        success: false,
        tenders: [],
        newTendersCount: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async runFullScrape(source: string = "AUTO") {
    this.isPaused = false; // Reset on start
    const results: ScrapeResult[] = [];

    // Create tasks wrapped in p-limit for concurrency
    const tasks = DISTRICTS.map((district) => {
      return scraperLimit(async () => {
        if (this.isPaused) return { district, success: false, error: "Paused", tenders: [], newTendersCount: 0 };
        await randomDelay(1000, 3000);
        const result = await this.scrapeDistrict(district, source);
        results.push(result);
        return result;
      });
    });

    // Also add the state-level NICGEP scraper task
    const stateTask = scraperLimit(async () => {
      if (this.isPaused) return { district: "State Level", success: false, error: "Paused", tenders: [], newTendersCount: 0 };
      await randomDelay(1000, 3000);
      const result = await scrapeStateTenders(this.prisma, source, () => this.isPaused);
      results.push(result);
      return result;
    });

    await Promise.allSettled([...tasks, stateTask]);

    return {
      success: true,
      districtsProcessed: DISTRICTS.length + 1,
      results,
    };
  }

  async scrapeStateTenders(source: string = "AUTO") {
    this.isPaused = false;
    return scrapeStateTenders(this.prisma, source, () => this.isPaused);
  }
}
