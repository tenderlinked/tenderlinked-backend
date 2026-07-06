import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import * as https from 'https';
import * as http from 'http';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { parseTenderPage } from './parser';
import { ScraperTargetsService } from './scraper-targets.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { TenantRoleGuard } from '../auth/guards/tenant-role.guard';

const healthCache = new Map<string, { healthy: boolean, timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

@ApiTags('Scraper Targets')
@ApiBearerAuth()
@UseGuards(SuperAdminGuard)
@Controller('scraper-targets')
export class ScraperTargetsController {
  constructor(private readonly scraperTargetsService: ScraperTargetsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all scraper targets' })
  findAll() {
    return this.scraperTargetsService.findAll();
  }

  @Get('health')
  @ApiOperation({ summary: 'Check if a URL is reachable' })
  async checkHealth(@Query('url') url: string) {
    if (!url) return { healthy: false };
    
    if (healthCache.has(url)) {
      const cached = healthCache.get(url);
      if (Date.now() - cached!.timestamp < CACHE_TTL) {
        return { healthy: cached!.healthy, cached: true };
      }
    }
    
    return new Promise((resolve) => {
      const isHttps = url.startsWith('https');
      const client = isHttps ? https : http;
      
      const req = client.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        rejectUnauthorized: false,
        timeout: 8000
      }, (res) => {
        const s = res.statusCode || 500;
        const healthy = s < 500 || s === 503; 
        res.destroy(); 
        healthCache.set(url, { healthy, timestamp: Date.now() });
        resolve({ healthy });
      });

      req.on('error', () => {
        healthCache.set(url, { healthy: false, timestamp: Date.now() });
        resolve({ healthy: false });
      });

      req.on('timeout', () => {
        req.destroy();
        healthCache.set(url, { healthy: false, timestamp: Date.now() });
        resolve({ healthy: false });
      });
    });
  }

  @Get('preview')
  @ApiOperation({ summary: 'Test scrape a URL to preview extracted tenders' })
  async previewScrape(@Query('url') url: string, @Query('type') type: string, @Query('name') name: string) {
    if (!url) return { success: false, reason: 'No URL provided' };
    
    try {
      if (type === 'DISTRICT') {
        const getFallbacks = (originalUrl: string) => {
          const fallbacks: { url: string; oldPattern: string | null; newPattern: string | null; suggestedUrl: string | null }[] = [];
          
          if (originalUrl.includes('/en/tender/tenders-archive')) {
             fallbacks.push({ 
               url: originalUrl.replace('/en/tender/tenders-archive', '/notice_category/tenders/'), 
               oldPattern: '/en/tender/tenders-archive', newPattern: '/notice_category/tenders/',
               suggestedUrl: originalUrl.replace('/en/tender/tenders-archive', '/notice_category/tenders/')
             });
             fallbacks.push({ 
               url: originalUrl.replace('/en/tender/tenders-archive', '/en/tender'), 
               oldPattern: '/en/tender/tenders-archive', newPattern: '/en/tender',
               suggestedUrl: originalUrl.replace('/en/tender/tenders-archive', '/en/tender')
             });
             fallbacks.push({ 
               url: originalUrl, 
               oldPattern: '/en/tender/tenders-archive', newPattern: '/notice_category/tenders/',
               suggestedUrl: originalUrl.replace('/en/tender/tenders-archive', '/notice_category/tenders/')
             });
          } else if (originalUrl.includes('/past-notices/tenders/')) {
             fallbacks.push({ 
               url: originalUrl.replace('/past-notices/tenders/', '/notice_category/tenders/'), 
               oldPattern: '/past-notices/tenders/', newPattern: '/notice_category/tenders/',
               suggestedUrl: originalUrl.replace('/past-notices/tenders/', '/notice_category/tenders/')
             });
             fallbacks.push({ 
               url: originalUrl.replace('/past-notices/tenders/', '/en/tender'), 
               oldPattern: '/past-notices/tenders/', newPattern: '/en/tender',
               suggestedUrl: originalUrl.replace('/past-notices/tenders/', '/en/tender')
             });
             fallbacks.push({ 
               url: originalUrl, 
               oldPattern: '/past-notices/tenders/', newPattern: '/notice_category/tenders/',
               suggestedUrl: originalUrl.replace('/past-notices/tenders/', '/notice_category/tenders/')
             });
          } else {
             fallbacks.push({ url: originalUrl, oldPattern: null, newPattern: null, suggestedUrl: originalUrl });
             if (originalUrl.includes('/en/tender')) {
                fallbacks.push({ 
                  url: originalUrl.replace('/en/tender', '/notice_category/tenders/'), 
                  oldPattern: '/en/tender', newPattern: '/notice_category/tenders/',
                  suggestedUrl: originalUrl.replace('/en/tender', '/notice_category/tenders/')
                });
                fallbacks.push({ 
                  url: originalUrl.replace('/en/tender', '/past-notices/tenders/'), 
                  oldPattern: '/en/tender', newPattern: '/notice_category/tenders/',
                  suggestedUrl: originalUrl.replace('/en/tender', '/notice_category/tenders/')
                });
                fallbacks.push({ 
                  url: originalUrl.replace('/en/tender', '/en/tender/tenders-archive'), 
                  oldPattern: '/en/tender', newPattern: '/en/tender',
                  suggestedUrl: originalUrl
                });
             } else if (originalUrl.includes('/notice_category/tenders/')) {
                fallbacks.push({ 
                  url: originalUrl.replace('/notice_category/tenders/', '/en/tender'), 
                  oldPattern: '/notice_category/tenders/', newPattern: '/en/tender',
                  suggestedUrl: originalUrl.replace('/notice_category/tenders/', '/en/tender')
                });
                fallbacks.push({ 
                  url: originalUrl.replace('/notice_category/tenders/', '/en/tender/tenders-archive'), 
                  oldPattern: '/notice_category/tenders/', newPattern: '/en/tender',
                  suggestedUrl: originalUrl.replace('/notice_category/tenders/', '/en/tender')
                });
                fallbacks.push({ 
                  url: originalUrl.replace('/notice_category/tenders/', '/past-notices/tenders/'), 
                  oldPattern: '/notice_category/tenders/', newPattern: '/notice_category/tenders/',
                  suggestedUrl: originalUrl
                });
             }
          }
          return fallbacks;
        };

        const fallbacks = getFallbacks(url);
        
        for (const attempt of fallbacks) {
           try {
             const response = await axios.get(attempt.url, {
               timeout: 10000,
               headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
               httpsAgent: new https.Agent({ rejectUnauthorized: false })
             });
             const tenders = parseTenderPage(response.data, name || 'District', attempt.url);
             if (tenders && tenders.length > 0) {
               return { 
                 success: true, 
                 tenders: tenders.slice(0, 5),
                 suggestedUrl: attempt.suggestedUrl,
                 suggestedOldPattern: attempt.oldPattern,
                 suggestedNewPattern: attempt.newPattern,
                 extractedFromArchive: attempt.url !== attempt.suggestedUrl
               };
             }
           } catch(e) {
             // Silently ignore and try the next one
           }
        }
        
        return { success: true, tenders: [] };
      } else {
        // STATE / NICGEP
        const baseUrlMatch = url.match(/^(https?:\/\/[^\/]+)/);
        const baseUrl = baseUrlMatch ? baseUrlMatch[1] : url.split('/nicgep')[0];

        const sessionRes = await axios.get(`${baseUrl}/nicgep/app`, {
          headers: { "User-Agent": 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
          timeout: 15000
        });

        const cookies = sessionRes.headers["set-cookie"];
        const cookieStr = cookies ? cookies.map((c: string) => c.split(";")[0]).join("; ") : "";

        const tenderRes = await axios.get(
          `${baseUrl}/nicgep/app?component=%24DirectLink&page=FrontEndTendersByOrganisation&service=direct&session=T&sp`,
          {
            headers: { "User-Agent": 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Cookie: cookieStr },
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            timeout: 15000
          }
        );

        const $ = cheerio.load(tenderRes.data);
        const rows = $("table#table tr.even, table#table tr.odd").toArray();
        const tenders: any[] = [];
        
        for (let i = 0; i < Math.min(5, rows.length); i++) {
          const cells = $(rows[i]).find("td");
          if (cells.length >= 5) {
             tenders.push({
               title: $(cells[4]).text().trim() || $(cells[4]).find("a").text().trim(),
               startDate: $(cells[1]).text().trim(),
               endDate: $(cells[2]).text().trim(),
               openingDate: $(cells[3]).text().trim(),
               sourceUrl: url
             });
          }
        }
        return { success: true, tenders };
      }
    } catch (error: any) {
      return { success: false, reason: error.message || 'Server Error' };
    }
  }

  @Patch('bulk-update-state-urls')
  @ApiOperation({ summary: 'Bulk update URLs for a specific state based on pattern' })
  async bulkUpdateStateUrls(@Body() data: { state: string, oldPattern?: string, newPattern?: string }) {
    if (!data.state) {
       return { success: false, reason: "Missing required fields" };
    }
    try {
       const targets = await this.scraperTargetsService.findAll();
       let stateTargets = targets.filter(t => t.type === 'DISTRICT' && t.state === data.state);
       
       if (data.oldPattern) {
         stateTargets = stateTargets.filter(t => t.url.includes(data.oldPattern as string));
       }
       
       let updatedCount = 0;
       for (const target of stateTargets) {
          const newUrl = (data.oldPattern && data.newPattern) ? target.url.replace(data.oldPattern, data.newPattern) : target.url;
          await this.scraperTargetsService.update(target.id, { url: newUrl, isVerified: true } as any);
          updatedCount++;
       }
       return { success: true, updatedCount };
    } catch(err: any) {
       return { success: false, reason: err.message };
    }
  }

  @Post()
  @ApiOperation({ summary: 'Create a new scraper target' })
  create(@Body() data: { name: string; type: string; url: string; state?: string; regionStateId?: string; regionDistrictId?: string; isActive?: boolean }) {
    return this.scraperTargetsService.create(data);
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Create multiple scraper targets in bulk' })
  createBulk(@Body() data: { targets: { name: string; type: string; url: string; state: string; regionStateId?: string; regionDistrictId?: string; isActive?: boolean }[] }) {
    return this.scraperTargetsService.createBulk(data.targets);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a scraper target' })
  update(@Param('id') id: string, @Body() data: { name?: string; type?: string; url?: string; state?: string; regionStateId?: string; regionDistrictId?: string; isActive?: boolean; isVerified?: boolean }) {
    return this.scraperTargetsService.update(id, data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a scraper target' })
  remove(@Param('id') id: string) {
    return this.scraperTargetsService.remove(id);
  }
}
