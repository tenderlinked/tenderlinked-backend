import { Injectable, OnModuleInit } from "@nestjs/common";
import axios from "axios";
import { PrismaService } from "../prisma/prisma.service";
import { scraperLimit, randomDelay } from "./queue";
import { withRetry } from "./retry";
import { parseTenderPage } from "./parser";
import { ScrapeResult, TenderSchema, ScrapeInstance, ScrapeStatus } from "./types";
import { scrapeStateTenders } from "./nicgep-scraper";
import { scrapeApStateTenders } from "./apeprocurement-scraper";
import { v4 as uuidv4 } from 'uuid';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SessionService } from "./session.service";
import * as fs from 'fs';
import * as path from 'path';
const cronParser = require('cron-parser');

const DEFAULT_TIMEOUT = 30000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

@Injectable()
export class ScraperService implements OnModuleInit {
  private activeInstances = new Map<string, ScrapeInstance>();
  private readonly CACHE_DIR = path.join(process.cwd(), "scraper_cache");
  private readonly CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService
  ) {
    if (!fs.existsSync(this.CACHE_DIR)) {
      fs.mkdirSync(this.CACHE_DIR, { recursive: true });
    }
  }

  async onModuleInit() {
    // Find interrupted scrapes before marking them as failed
    const interruptedScrapes = await this.prisma.scrapeLog.findMany({
      where: { OR: [{ status: 'RUNNING' }, { status: 'PAUSED' }] }
    });

    // Clean up any zombie runs left over from a crash
    await this.prisma.scrapeLog.updateMany({
      where: { OR: [{ status: 'RUNNING' }, { status: 'PAUSED' }] },
      data: { status: 'FAILED', error: 'Server restarted unexpectedly. Resuming in a new job.' }
    });

    const targetIdsToResume = interruptedScrapes
      .map(log => log.targetId)
      .filter(id => id !== null) as string[];
      
    const uniqueTargetIds = [...new Set(targetIdsToResume)];

    if (uniqueTargetIds.length > 0) {
      console.log(`[ScraperService] Auto-resuming ${uniqueTargetIds.length} interrupted targets after server restart...`);
      // Add a slight delay to ensure full app initialization before scraping
      setTimeout(() => {
        this.scrapeSpecificTargets(uniqueTargetIds, 'AUTO').catch(e => 
          console.error('[ScraperService] Failed to auto-resume targets:', e)
        );
      }, 5000);
    }
  }

  stopScrape() {
    for (const [id, instance] of this.activeInstances.entries()) {
      if (instance.status === 'RUNNING' || instance.status === 'PAUSED') {
        instance.status = 'STOPPED';
      }
    }
  }

  async getInstances(): Promise<ScrapeInstance[]> {
    const active = Array.from(this.activeInstances.values());
    const activeNames = new Set(active.map(a => a.targetName));
    
    const history = await this.prisma.scrapeLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    
    const historicalInstances: ScrapeInstance[] = history
      .filter(log => !['RUNNING', 'PENDING', 'PAUSED'].includes(log.status))
      .map(log => ({
        id: log.id,
        targetId: log.targetId || '',
        targetName: log.targetRegion,
        targetType: 'HISTORY',
        sourceUrl: '',
        status: log.status as ScrapeStatus,
        source: log.source,
        progress: {
          page: 0,
          tendersFound: log.tendersFound,
          newTendersAdded: log.newTendersAdded || 0,
        },
        startTime: log.createdAt,
        endTime: log.createdAt,
        error: log.error || undefined
      }));
      
    return [...active, ...historicalInstances];
  }

  async updateInstanceStatus(id: string, status: ScrapeStatus) {
    const instance = this.activeInstances.get(id);
    if (instance) {
      instance.status = status;
    } else {
      // If it's not in active instances, it might be a historical log stuck in the DB
      try {
        await this.prisma.scrapeLog.update({
          where: { id },
          data: { status }
        });
      } catch (e) {
        console.error(`[ScraperService] Failed to update historical log ${id}:`, e);
      }
    }
  }

  async scrapeDistrict(target: { name: string; url: string; id?: string }, source: string = "AUTO", instanceId?: string): Promise<ScrapeResult> {
    const district = target.name;
    let page = 0;
    const maxPages = 10;
    let hasMore = true;
    const allValidTenders: any[] = [];
    const seenTitles = new Set<string>();
    let totalNewTendersCount = 0;

    const scrapeLog = await this.prisma.scrapeLog.create({
      data: {
        targetId: target.id,
        targetRegion: district,
        status: "RUNNING",
        tendersFound: 0,
        source,
      },
    });

    try {
      while (hasMore && page < maxPages) {
        if (instanceId) {
          let currentStatus = this.activeInstances.get(instanceId)?.status;
          if (currentStatus === 'STOPPED') break;
          while (currentStatus === 'PAUSED') {
            await new Promise(resolve => setTimeout(resolve, 1000));
            currentStatus = this.activeInstances.get(instanceId)?.status;
            if (currentStatus === 'STOPPED') break;
          }
          if (currentStatus === 'STOPPED') break;
          
          const instance = this.activeInstances.get(instanceId);
          if (instance) instance.progress.page = page + 1;
        }

        // Use the base URL provided in the database and append pagination
        let url = target.url;
        if (page > 0) {
          const base = url.replace(/\/$/, '');
          if (base.includes('?')) {
            url = `${base}&page=${page}`;
          } else {
            url = `${base}/page/${page + 1}/`;
          }
        }

        // 1. Fetch with retry and timeout
        const response = await withRetry(async () => {
          return await axios.get(url, {
            timeout: DEFAULT_TIMEOUT,
            validateStatus: (status) => status < 400 || status === 404,
            headers: {
              "User-Agent": USER_AGENT,
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.5",
            },
          });
        }, 3, 1000);

        if (response.status === 404) {
          console.log(`[Scraper Info] District ${district} reached 404 on page ${page} (${url}). Stopping pagination.`);
          hasMore = false;
          break;
        }

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
          console.log(
            `[Scraper Info] District ${district} has no more pages (same content returned on page ${page}). Stopping pagination.`
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

        // --- REAL-TIME BATCH SAVING ---
        let batchNewTendersCount = 0;
        for (const tender of validTenders) {
          try {
            const existing = await this.prisma.tender.findFirst({
              where: { 
                title: tender.title,
                district: tender.district 
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
              batchNewTendersCount++;
              totalNewTendersCount++;
            }
          } catch (dbError) {
            console.error(`[DB Error] District: ${district}`, dbError);
          }
        }

        const instance = instanceId ? this.activeInstances.get(instanceId) : null;
        if (instance) {
           instance.progress.tendersFound += validTenders.length;
           instance.progress.newTendersAdded += batchNewTendersCount;
        }
        // --------------------------------

        page++;

        // Be polite to the server between pages
        if (hasMore && page < maxPages) {
          await randomDelay(1000, 2000);
        }
      }

      await this.prisma.scrapeLog.update({
        where: { id: scrapeLog.id },
        data: {
          status: "SUCCESS",
          tendersFound: allValidTenders.length,
          newTendersAdded: totalNewTendersCount,
        } as any,
      });

      if (instanceId && this.activeInstances.has(instanceId)) {
        const inst = this.activeInstances.get(instanceId)!;
        if (inst.status !== 'STOPPED') inst.status = 'SUCCESS';
        inst.endTime = new Date();
      }

      return {
        district,
        success: true,
        tenders: allValidTenders,
        newTendersCount: totalNewTendersCount,
      };
    } catch (error: any) {
      console.error(`[Scraper Error] District: ${district}`, error);

      await this.prisma.scrapeLog.update({
        where: { id: scrapeLog.id },
        data: {
          status: "FAILED",
          error: error.message,
        },
      });

      if (instanceId && this.activeInstances.has(instanceId)) {
        const inst = this.activeInstances.get(instanceId)!;
        inst.status = 'FAILED';
        inst.endTime = new Date();
        inst.error = error instanceof Error ? error.message : "Unknown error";
      }

      return {
        district,
        success: false,
        tenders: [],
        newTendersCount: totalNewTendersCount,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  isTargetActive(targetId: string): boolean {
    for (const inst of this.activeInstances.values()) {
      if (inst.targetId === targetId && (inst.status === 'RUNNING' || inst.status === 'PAUSED' || inst.status === 'PENDING')) {
        return true;
      }
    }
    return false;
  }

  private createInstance(target: any, source: string, initialStatus: ScrapeStatus = 'RUNNING'): ScrapeInstance {
    const id = uuidv4();
    const instance: ScrapeInstance = {
      id,
      targetId: target.id || '',
      targetName: target.name,
      targetType: target.type || 'DISTRICT',
      sourceUrl: target.url,
      status: initialStatus,
      source,
      progress: { page: 0, tendersFound: 0, newTendersAdded: 0 },
      startTime: new Date()
    };
    this.activeInstances.set(id, instance);
    return instance;
  }

  async runFullScrape(source: string = "AUTO") {
    const results: ScrapeResult[] = [];

    // Fetch active targets from database
    const activeTargets = await this.prisma.scraperTarget.findMany({
      where: { isActive: true },
    });

    const validTargets = activeTargets.filter(t => !this.isTargetActive(t.id));

    const districtTargets = validTargets.filter(t => t.type === 'DISTRICT');
    const stateTargets = validTargets.filter(t => t.type === 'STATE');

    // Create tasks wrapped in p-limit for concurrency
    const districtTasks = districtTargets.map((target) => {
      const instance = this.createInstance(target, source, 'PENDING');
      return scraperLimit(async () => {
        if (instance.status === 'STOPPED') return { district: target.name, success: false, tenders: [], error: 'Stopped' };
        instance.status = 'RUNNING';
        await randomDelay(1000, 3000);
        
        const result = await this.scrapeDistrict(target, source, instance.id);
        results.push(result);
        this.activeInstances.delete(instance.id);
        return result;
      });
    });

    // Add the state-level NICGEP scraper tasks
    const stateTasks = stateTargets.map((target) => {
      const instance = this.createInstance(target, source, 'PENDING');
      return scraperLimit(async () => {
        if (instance.status === 'STOPPED') return { district: target.name, success: false, tenders: [], error: 'Stopped' };
        instance.status = 'RUNNING';
        await randomDelay(1000, 3000);

        const getStatus = (): ScrapeStatus => {
           const current = this.activeInstances.get(instance.id);
           return current ? current.status : 'RUNNING';
        };
        const onProgress = (found: number, added: number) => {
           const current = this.activeInstances.get(instance.id);
           if (current) {
             current.progress.tendersFound += found;
             current.progress.newTendersAdded += added;
           }
        };

        let result: ScrapeResult;
        const scraperType = (target as any).scraperType || "AUTO";
        
        if (scraperType === "AP_EPROCUREMENT") {
            result = await scrapeApStateTenders(this.prisma, this.sessionService, target, source, getStatus, onProgress);
        } else if (scraperType === "NICGEP") {
            result = await scrapeStateTenders(this.prisma, this.sessionService, target, source, getStatus, onProgress);
        } else if (target.url.includes("apeprocurement.gov.in")) {
            // Fallback to URL-based auto-routing
            result = await scrapeApStateTenders(this.prisma, this.sessionService, target, source, getStatus, onProgress);
        } else {
            result = await scrapeStateTenders(this.prisma, this.sessionService, target, source, getStatus, onProgress);
        }
        
        const current = this.activeInstances.get(instance.id);
        if (current) {
           if (current.status !== 'STOPPED') {
             current.status = result.success ? 'SUCCESS' : 'FAILED';
           }
           current.endTime = new Date();
           if (!result.success && current.status !== 'STOPPED') current.error = result.error;
        }

        results.push(result);
        this.activeInstances.delete(instance.id);
        return result;
      });
    });

    // Fire and forget
    Promise.allSettled([...districtTasks, ...stateTasks]).catch(e => console.error("Scraper Error", e));

    return {
      success: true,
      districtsProcessed: activeTargets.length,
      results: [],
    };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleScheduledScrapes() {
    const targets = await this.prisma.scraperTarget.findMany({
      where: { isActive: true, cronSchedule: { not: null } },
    });

    for (const target of targets) {
      if (!target.cronSchedule) continue;

      try {
        const interval = cronParser.parseExpression(target.cronSchedule);
        const prev = interval.prev().toDate();
        const now = new Date();

        // If the cron expression says it should have run in the last 60 seconds (since this checks every minute),
        // or if we want to be safe, just check if `prev` is within the last 60 seconds.
        const diffMs = now.getTime() - prev.getTime();
        
        // Let's ensure it hasn't already been run recently (e.g. check last ScrapeLog).
        // A safer way is to check if `prev` > lastRunTime and `prev` < now
        const lastLog = await this.prisma.scrapeLog.findFirst({
           where: { targetRegion: target.name, source: 'AUTO' },
           orderBy: { createdAt: 'desc' }
        });

        const lastRunTime = lastLog ? lastLog.createdAt : new Date(0);

        if (prev > lastRunTime && diffMs < 120000) {
           console.log(`[Cron] Triggering auto-scrape for ${target.name} (Schedule: ${target.cronSchedule})`);
           this.scrapeSpecificTargets([target.id], 'AUTO');
        }
      } catch (err) {
        console.error(`[Cron] Invalid cron schedule for ${target.name}: ${target.cronSchedule}`, err);
      }
    }
  }

  async scrapeSpecificTargets(targetIds: string[], source: string = "MANUAL") {
    const results: ScrapeResult[] = [];

    const targets = await this.prisma.scraperTarget.findMany({
      where: { id: { in: targetIds } },
    });

    const validTargets = targets.filter(t => !this.isTargetActive(t.id));

    const districtTargets = validTargets.filter(t => t.type === 'DISTRICT');
    const stateTargets = validTargets.filter(t => t.type === 'STATE');

    const districtTasks = districtTargets.map((target) => {
      const instance = this.createInstance(target, source, 'PENDING');
      return scraperLimit(async () => {
        if (instance.status === 'STOPPED') return { district: target.name, success: false, tenders: [], error: 'Stopped' };
        instance.status = 'RUNNING';
        await randomDelay(1000, 3000);
        
        const result = await this.scrapeDistrict(target, source, instance.id);
        results.push(result);
        this.activeInstances.delete(instance.id);
        return result;
      });
    });

    const stateTasks = stateTargets.map((target) => {
      const instance = this.createInstance(target, source, 'PENDING');
      return scraperLimit(async () => {
        if (instance.status === 'STOPPED') return { district: target.name, success: false, tenders: [], error: 'Stopped' };
        instance.status = 'RUNNING';
        await randomDelay(1000, 3000);

        const getStatus = (): ScrapeStatus => {
           const current = this.activeInstances.get(instance.id);
           return current ? current.status : 'RUNNING';
        };
        const onProgress = (found: number, added: number) => {
           const current = this.activeInstances.get(instance.id);
           if (current) {
             current.progress.tendersFound += found;
             current.progress.newTendersAdded += added;
           }
        };

        let result: ScrapeResult;
        const scraperType = (target as any).scraperType || "AUTO";
        
        if (scraperType === "AP_EPROCUREMENT") {
            result = await scrapeApStateTenders(this.prisma, this.sessionService, target, source, getStatus, onProgress);
        } else if (scraperType === "NICGEP") {
            result = await scrapeStateTenders(this.prisma, this.sessionService, target, source, getStatus, onProgress);
        } else if (target.url.includes("apeprocurement.gov.in")) {
            // Fallback to URL-based auto-routing
            result = await scrapeApStateTenders(this.prisma, this.sessionService, target, source, getStatus, onProgress);
        } else {
            result = await scrapeStateTenders(this.prisma, this.sessionService, target, source, getStatus, onProgress);
        }
        
        const current = this.activeInstances.get(instance.id);
        if (current) {
           if (current.status !== 'STOPPED') {
             current.status = result.success ? 'SUCCESS' : 'FAILED';
           }
           current.endTime = new Date();
           if (!result.success && current.status !== 'STOPPED') current.error = result.error;
        }

        results.push(result);
        this.activeInstances.delete(instance.id);
        return result;
      });
    });

    // Fire and forget
    Promise.allSettled([...districtTasks, ...stateTasks]).catch(e => console.error("Scraper Error", e));

    return {
      success: true,
      districtsProcessed: targets.length,
      results: [],
    };
  }
}
