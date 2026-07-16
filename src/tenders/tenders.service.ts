import { Injectable, InternalServerErrorException, ForbiddenException, NotFoundException } from "@nestjs/common";
import puppeteer from 'puppeteer';
import { generateAiSummaryHtml, AiSummaryData } from '../queue/templates/ai-summary.template';
import { PrismaService } from "../prisma/prisma.service";
import { redactTenderBasedOnPlan } from "../common/utils/content-gating.util";
import { CreateTenderDto } from "./dto/create-tender.dto";
import { UpdateTenderDto } from "./dto/update-tender.dto";
import * as fs from 'fs';
import * as path from 'path';
import archiver = require('archiver');
import { Response } from "express";
import { S3Service } from "../aws/s3.service";
import { BoqProcessorService } from "../queue/boq.processor";

@Injectable()
export class TendersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly boqProcessorService: BoqProcessorService
  ) {}

  async getTenders(params: {
    userId?: string | null;
    district?: string | null;
    search?: string | null;
    active?: string | null;
    priority?: string | null;
    page: number;
    pageSize: number;
    date?: string | null;
    excludeToday?: string | null;
    bookmarked?: string | null;
    applied?: string | null;
    dateRange?: string | null;
    includeStats?: string | null;
    tenderType?: string | null;
    states?: string[];
    districts?: string[];
    categories?: string[];
    authorities?: string[];
    minAmount?: number | null;
    maxAmount?: number | null;
    sidebarKeywords?: string[];
    sort?: string | null;
  }) {
    const {
      userId, search, active, priority, page, pageSize, date, excludeToday, tenderType,
      states, districts, categories, authorities, minAmount, maxAmount, sidebarKeywords,
      bookmarked, sort
    } = params;

    const keywords = await this.prisma.priorityKeyword.findMany();
    const keywordList = keywords.map((k: any) => k.word);

    let allowedFields: string[] = [];
    let tenantId: string | null = null;
    let unlockedTenderIds: Set<string> = new Set();
    let allBookmarkedIds: Set<string> = new Set();

    if (userId) {
      const member = await this.prisma.tenantMember.findFirst({
        where: { userId },
        include: { tenant: { include: { subscription: true } } }
      });
      if (member?.tenant?.id) {
        tenantId = member.tenant.id;
        if (member.tenant.subscription?.planType) {
          const plan = await this.prisma.pricingPlan.findUnique({
            where: { name: member.tenant.subscription.planType }
          });
          if (plan) allowedFields = plan.allowedTenderFields;
        } else {
          const defaultPlan = await this.prisma.pricingPlan.findFirst({ where: { isDefault: true } });
          if (defaultPlan) allowedFields = defaultPlan.allowedTenderFields;
        }
      }
    } else {
      const defaultPlan = await this.prisma.pricingPlan.findFirst({ where: { isDefault: true } });
      if (defaultPlan) allowedFields = defaultPlan.allowedTenderFields;
    }

    const where: any = {};
    const AND: any[] = [];

    // Filter by States
    if (states && states.length > 0) {
      // If "All States" is in the list, we don't need to filter by state
      if (!states.includes("All States")) {
        AND.push({
          OR: states.map(s => ({ state: { contains: s, mode: 'insensitive' } }))
        });
      }
    }

    // Filter by Districts / Cities
    if (districts && districts.length > 0) {
      if (!districts.includes("All Cities")) {
        AND.push({
          OR: districts.flatMap(d => [
            { district: { contains: d, mode: 'insensitive' } },
            { city: { contains: d, mode: 'insensitive' } },
            { organisation: { contains: d, mode: 'insensitive' } }
          ])
        });
      }
    }

    // Filter by Categories
    if (categories && categories.length > 0 && !categories.includes("all")) {
      AND.push({
        OR: categories.map(c => ({ tenderCategory: { contains: c, mode: 'insensitive' } }))
      });
    }

    // Filter by Authorities
    if (authorities && authorities.length > 0 && !authorities.includes("all")) {
      AND.push({
        OR: authorities.map(a => ({ organisation: { contains: a, mode: 'insensitive' } }))
      });
    }

    // Filter by Tender Amount
    if (minAmount !== undefined && minAmount !== null) {
      where.tenderAmount = { ...where.tenderAmount, gte: minAmount };
    }
    if (maxAmount !== undefined && maxAmount !== null) {
      where.tenderAmount = { ...where.tenderAmount, lte: maxAmount };
    }

    if (priority === "HIGH") {
      const keywordConditions =
        keywordList.length > 0
          ? [
              { tags: { hasSome: keywordList } },
              ...keywordList.map((kw: string) => ({ title: { contains: kw, mode: "insensitive" as const } })),
              ...keywordList.map((kw: string) => ({ aiSummary: { contains: kw, mode: "insensitive" as const } })),
            ]
          : [];
      if (keywordConditions.length > 0) AND.push({ OR: keywordConditions });
      else AND.push({ id: "NONE" });
    }

    if (search) {
      AND.push({
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
          { state: { contains: search, mode: "insensitive" } },
          { district: { contains: search, mode: "insensitive" } },
          { city: { contains: search, mode: "insensitive" } },
          { organisation: { contains: search, mode: "insensitive" } },
          { tenderCategory: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    // Sidebar keyword filter — each keyword is an OR across all text fields
    if (sidebarKeywords && sidebarKeywords.length > 0) {
      AND.push({
        OR: sidebarKeywords.flatMap(kw => [
          { title: { contains: kw, mode: 'insensitive' as const } },
          { description: { contains: kw, mode: 'insensitive' as const } },
          { state: { contains: kw, mode: 'insensitive' as const } },
          { district: { contains: kw, mode: 'insensitive' as const } },
          { city: { contains: kw, mode: 'insensitive' as const } },
          { organisation: { contains: kw, mode: 'insensitive' as const } },
          { tenderCategory: { contains: kw, mode: 'insensitive' as const } },
        ]),
      });
    }

    if (active === "true") {
      const now = new Date();
      AND.push({ OR: [{ endDate: { gte: now } }, { endDate: null }] });
    } else if (active === "false") {
      where.endDate = { lt: new Date() };
    }

    if (bookmarked === "true" && tenantId) {
      const actions = await this.prisma.tenantTenderAction.findMany({
        where: { tenantId, isBookmarked: true },
        select: { tenderId: true }
      });
      const bIds = actions.map(a => a.tenderId);
      AND.push({ id: { in: bIds.length > 0 ? bIds : ['NONE'] } });
    }

    if (AND.length > 0) where.AND = AND;

    let orderBy: any = [{ startDate: "desc" }, { createdAt: "desc" }];
    if (sort === "newest") {
      orderBy = [{ createdAt: "desc" }];
    } else if (sort === "closing_soon") {
      orderBy = [{ endDate: "asc" }];
    } else if (sort === "high_value") {
      orderBy = [{ tenderAmount: "desc" }];
    } else if (sort && sort.includes('_')) {
      const parts = sort.split('_');
      const dir = parts.pop() as string;
      const field = parts.join('_');
      const validFields = ['startDate', 'endDate', 'tenderAmount', 'title', 'tenderId', 'organisation', 'tenderCategory'];
      if (validFields.includes(field) && (dir === 'asc' || dir === 'desc')) {
        orderBy = [{ [field]: dir }];
      }
    }

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [tenders, total, pendingQueue] = await Promise.all([
      this.prisma.tender.findMany({
        where, skip, take, orderBy,
        select: {
          id: true,
          tenderId: true,
          tenderRefNumber: true,
          tenderCode: true,
          title: true,
          description: true,
          organisation: true,
          state: true,
          district: true,
          city: true,
          location: true,
          tenderAmount: true,
          tenderValue: true,
          noticePdfUrl: true,
          tenderPdfUrl: true,
          startDate: true,
          endDate: true,
          aiSummary: true,
          documentsDownloaded: true,
          tags: true,
          createdAt: true,
          tenderCategory: true,
          sourceUrl: true
        }
      }),
      this.prisma.tender.count({ where }),
      this.prisma.tender.count({ where: { aiProcessed: false } }),
    ]);

    if (tenantId && tenders.length > 0) {
      const tenderIds = tenders.map(t => t.id);
      const [unlocks, actions] = await Promise.all([
        this.prisma.tenantUnlockedTender.findMany({
          where: { tenantId, tenderId: { in: tenderIds } },
          select: { tenderId: true }
        }),
        this.prisma.tenantTenderAction.findMany({
          where: { tenantId, tenderId: { in: tenderIds }, isBookmarked: true },
          select: { tenderId: true }
        })
      ]);
      unlockedTenderIds = new Set(unlocks.map(u => u.tenderId));
      allBookmarkedIds = new Set(actions.map(a => a.tenderId));
    }

    const formattedTenders = tenders.map((t: any) => {
      const hasHighPriorityTag = t.tags && t.tags.some((tag: string) => keywordList.some((kw: string) => tag.toLowerCase().includes(kw.toLowerCase())));
      const titleMatch = keywordList.some((kw: string) => t.title?.toLowerCase().includes(kw.toLowerCase()));
      const summaryMatch = keywordList.some((kw: string) => t.aiSummary?.toLowerCase().includes(kw.toLowerCase()));
      
      const enhancedTender = {
        ...t,
        isHighPriority: hasHighPriorityTag || titleMatch || summaryMatch,
        isBookmarked: allBookmarkedIds.has(t.id),
        isApplied: false,
      };

      // Apply content gating
      const isUnlockedWithCredit = unlockedTenderIds.has(t.id);
      return redactTenderBasedOnPlan(enhancedTender, allowedFields, isUnlockedWithCredit);
    });

    return {
      success: true,
      data: formattedTenders,
      meta: { total, pendingQueue, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getTenderById(id: string, userId?: string | null) {
    const tender = await this.prisma.tender.findUnique({ where: { id } });
    if (!tender) return null;

    let allowedFields: string[] = [];
    let isUnlockedWithCredit = false;
    let memberTenantId: string | null = null;

    if (userId) {
      const member = await this.prisma.tenantMember.findFirst({
        where: { userId },
        include: { tenant: { include: { subscription: true } } }
      });

      if (member?.tenant?.id) {
        memberTenantId = member.tenant.id;
        const unlock = await this.prisma.tenantUnlockedTender.findFirst({
          where: { tenantId: member.tenant.id, tenderId: id }
        });
        if (unlock) isUnlockedWithCredit = true;
      }

      if (member?.tenant?.subscription) {
        const sub = member.tenant.subscription;
        
        let plan: any = null;
        if (sub.planType) {
          plan = await this.prisma.pricingPlan.findUnique({
            where: { name: sub.planType }
          });
          if (plan) allowedFields = plan.allowedTenderFields;
        }

        if (!plan) {
          plan = await this.prisma.pricingPlan.findFirst({ where: { isDefault: true } });
          if (plan) allowedFields = plan.allowedTenderFields;
        }

        const maxTenderViews = plan?.maxTenderViews || 50;

        // Check if the tender was already viewed
        const alreadyViewed = await this.prisma.tenantTenderView.findUnique({
          where: { tenantId_tenderId: { tenantId: member.tenant.id, tenderId: id } }
        });

        if (!alreadyViewed) {
          // Check view limit
          if (sub.tendersViewedThisMonth >= maxTenderViews) {
            throw new ForbiddenException({
              error: "Limit Exceeded",
              message: "You have reached your maximum tender view limit for this month.",
              limitReached: true,
            });
          }

          // Increment view count and record view
          await this.prisma.$transaction([
            this.prisma.tenantTenderView.create({
              data: { tenantId: member.tenant.id, tenderId: id }
            }),
            this.prisma.tenantSubscription.update({
              where: { id: sub.id },
              data: { tendersViewedThisMonth: { increment: 1 } }
            })
          ]);
        }

      } else {
        const defaultPlan = await this.prisma.pricingPlan.findFirst({ where: { isDefault: true } });
        if (defaultPlan) allowedFields = defaultPlan.allowedTenderFields;
      }
    } else {
      const defaultPlan = await this.prisma.pricingPlan.findFirst({ where: { isDefault: true } });
      if (defaultPlan) allowedFields = defaultPlan.allowedTenderFields;
    }

    const enhancedTender = {
      ...tender,
      isBookmarked: false,
      isApplied: false,
    };

    if (memberTenantId && enhancedTender.id) {
      const action = await this.prisma.tenantTenderAction.findFirst({
        where: { tenantId: memberTenantId, tenderId: tender.id }
      });
      if (action) {
        enhancedTender.isBookmarked = action.isBookmarked;
        enhancedTender.isApplied = action.isApplied;
      }
    }

    return redactTenderBasedOnPlan(enhancedTender, allowedFields, isUnlockedWithCredit);
  }

  async getTenderAiStatus(id: string) {
    const tender = await this.prisma.tender.findUnique({ 
      where: { id },
      select: { id: true, aiProcessed: true, aiSummary: true }
    });
    return tender;
  }

  async getTenderDocuments(id: string, userId: string | null = null): Promise<{url: string, size: number}[]> {
    const tender = await this.prisma.tender.findUnique({
      where: { id },
      select: { tenderCode: true, id: true, documentsDownloaded: true, state: true }
    });
    
    if (!tender || !tender.documentsDownloaded) return [];

    let isUnlockedWithCredit = false;
    let allowedFields: string[] = [];

    if (userId) {
      const member = await this.prisma.tenantMember.findFirst({
        where: { userId },
        include: { tenant: { include: { subscription: true } } }
      });

      if (member?.tenant?.id) {
        const unlock = await this.prisma.tenantUnlockedTender.findFirst({
          where: { tenantId: member.tenant.id, tenderId: id }
        });
        if (unlock) isUnlockedWithCredit = true;
      }

      if (member?.tenant?.subscription?.planType) {
        const plan = await this.prisma.pricingPlan.findUnique({
          where: { name: member.tenant.subscription.planType }
        });
        if (plan) allowedFields = plan.allowedTenderFields;
      }
    }

    if (!allowedFields.includes('noticePdfUrl') && !isUnlockedWithCredit) {
      // User is not allowed to download/view the documents without a credit
      return [];
    }

    const tenderIdPath = tender.tenderCode || tender.id;
    
    const stateTitle = tender.state || 'Unknown';
    const stateLC = stateTitle.toLowerCase();
    
    // Check possible prefixes where the user might have uploaded them
    const possiblePrefixes = [
      `tenders/${stateTitle}/${tenderIdPath}/`,
      `tenders/${stateLC}/${tenderIdPath}/`,
      `${stateTitle}/${tenderIdPath}/`,
      `${stateLC}/${tenderIdPath}/`,
      `tenderlinked/${stateTitle}/${tenderIdPath}/`,
      `tenderlinked/${stateLC}/${tenderIdPath}/`,
      `downloads/${stateTitle}/${tenderIdPath}/`,
      `downloads/${stateLC}/${tenderIdPath}/`
    ];

    let s3Objects: { key: string, size: number }[] = [];
    for (const prefix of possiblePrefixes) {
      s3Objects = await this.s3Service.listObjectsWithMetadata(prefix);
      if (s3Objects.length > 0) break;
    }
    
    if (s3Objects.length === 0) return [];
    
    // Generate presigned URLs for each key
    const docs = await Promise.all(s3Objects.map(async obj => {
      const url = await this.s3Service.getPresignedUrl(obj.key);
      return { url, size: obj.size };
    }));
    return docs;
  }

  async downloadAllDocuments(id: string, res: Response): Promise<void> {
    const tender = await this.prisma.tender.findUnique({
      where: { id },
      select: { tenderCode: true, id: true, documentsDownloaded: true, title: true, tenderId: true, state: true }
    });
    
    if (!tender || !tender.documentsDownloaded) {
      res.status(404).json({ success: false, message: "Documents not found" });
      return;
    }

    const tenderIdPath = tender.tenderCode || tender.id;
    const stateTitle = tender.state || 'Unknown';
    const stateLC = stateTitle.toLowerCase();
    
    const possiblePrefixes = [
      `tenders/${stateTitle}/${tenderIdPath}/`,
      `tenders/${stateLC}/${tenderIdPath}/`,
      `${stateTitle}/${tenderIdPath}/`,
      `${stateLC}/${tenderIdPath}/`,
      `tenderlinked/${stateTitle}/${tenderIdPath}/`,
      `tenderlinked/${stateLC}/${tenderIdPath}/`,
      `downloads/${stateTitle}/${tenderIdPath}/`,
      `downloads/${stateLC}/${tenderIdPath}/`
    ];

    let s3Keys: string[] = [];
    for (const prefix of possiblePrefixes) {
      s3Keys = await this.s3Service.listObjects(prefix);
      if (s3Keys.length > 0) break;
    }

    if (s3Keys.length === 0) {
      res.status(404).json({ success: false, message: "No complete documents found" });
      return;
    }

    // If exactly 1 file, stream it directly
    if (s3Keys.length === 1) {
      const key = s3Keys[0];
      const filename = path.basename(key);
      const stream = await this.s3Service.getObjectStream(key);
      
      res.set({
        'Content-Type': filename.endsWith('.zip') ? 'application/zip' : 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`
      });
      stream.pipe(res);
      return;
    }

    // Multiple files: zip them
    const safeId = (tender.tenderId || tender.tenderCode || 'Documents').replace(/[^a-z0-9-_]/gi, '_');
    const archiveName = `${safeId}.zip`;

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${archiveName}"`
    });

    // @ts-ignore
    const archive = new archiver.ZipArchive({ zlib: { level: 5 } });
    archive.pipe(res);

    for (const key of s3Keys) {
      const filename = path.basename(key);
      const stream = await this.s3Service.getObjectStream(key);
      archive.append(stream, { name: filename });
    }

    await archive.finalize();
  }

  async updateBookmark(id: string, isBookmarked: boolean, isState: boolean, userId: string) {
    const member = await this.prisma.tenantMember.findFirst({ where: { userId } });
    if (!member?.tenantId) throw new Error("Tenant not found");
    
    const action = await this.prisma.tenantTenderAction.upsert({
      where: {
        tenantId_tenderId: {
          tenantId: member.tenantId,
          tenderId: id,
        },
      },
      update: { isBookmarked },
      create: {
        tenantId: member.tenantId,
        tenderId: id,
        isBookmarked,
      },
    });

    return { success: true, action };
  }

  async updateApplied(id: string, isApplied: boolean, isState: boolean, userId: string) {
    const member = await this.prisma.tenantMember.findFirst({ where: { userId } });
    if (!member?.tenantId) throw new Error("Tenant not found");
    
    const action = await this.prisma.tenantTenderAction.upsert({
      where: {
        tenantId_tenderId: {
          tenantId: member.tenantId,
          tenderId: id,
        },
      },
      update: { isApplied },
      create: {
        tenantId: member.tenantId,
        tenderId: id,
        isApplied,
      },
    });

    return { success: true, action };
  }

  async retryAi(id: string, isState: boolean) {
    const updated = await this.prisma.tender.update({
      where: { id },
      data: { aiProcessed: true, aiError: 'Processing in background' },
    });
    // Run the processor asynchronously without awaiting
    this.boqProcessorService.processTender(id).catch(err => {
      console.error(`[BoqProcessorService] Failed to process tender ${id}:`, err);
    });
    return updated;
  }

  async getAiSummaryPdf(id: string): Promise<Buffer> {
    const tender = await this.prisma.tender.findUnique({
      where: { id },
      include: { boq: true }
    });

    if (!tender) {
      throw new NotFoundException("Tender not found");
    }

    if (!tender.aiSummary) {
      throw new InternalServerErrorException("AI Summary is not generated yet for this tender");
    }

    const aiData: AiSummaryData = {
      authorityName: tender.invitingAuthorityName || 'N/A',
      tdrNumber: tender.tenderId || tender.tenderCode || 'N/A',
      location: tender.location || tender.city || 'N/A',
      tenderValue: tender.tenderValue ? tender.tenderValue.toString() : 'N/A',
      emd: tender.emd ? tender.emd.toString() : 'N/A',
      tenderFee: tender.applicationCost || 'N/A',
      submissionDate: tender.endDate ? new Date(tender.endDate).toLocaleDateString() : 'N/A',
      contractPeriod: tender.periodOfWorkDays ? `${tender.periodOfWorkDays} Days` : 'N/A',
      workDescription: tender.title || 'N/A',
      scopeOfWork: tender.aiSummary ? tender.aiSummary.split('\n').map(s => s.trim().replace(/^- /, '')).filter(Boolean) : [tender.title || 'N/A'],
      keyDates: [
        { label: 'Start Date', value: tender.publishedDate ? new Date(tender.publishedDate).toLocaleDateString() : 'N/A' },
        { label: 'Bid Submission Date', value: tender.docDownloadEndDate ? new Date(tender.docDownloadEndDate).toLocaleDateString() : 'N/A' },
        { label: 'Bid Opening Date', value: tender.bidOpeningDate ? new Date(tender.bidOpeningDate).toLocaleDateString() : 'N/A' },
        { label: 'Closing Date', value: tender.endDate ? new Date(tender.endDate).toLocaleDateString() : 'N/A' },
        { label: 'Contract Period', value: tender.periodOfWorkDays ? `${tender.periodOfWorkDays} Days` : 'N/A' }
      ],
      locationAndContact: [
        { label: 'City', value: tender.city || 'N/A' },
        { label: 'State', value: tender.state || 'N/A' },
        { label: 'Pincode', value: tender.pincode || 'N/A' },
        { label: 'Address', value: tender.invitingAuthorityAddress || 'N/A' },
        { label: 'Contact Person', value: tender.invitingAuthorityName || 'N/A' },
        { label: 'Tender Portal Link', value: tender.sourceUrl || 'N/A' }
      ],
      basicDetail: [],
      finance: [],
      technicalQualification: [],
      exemptions: [],
      documentList: [],
      boqItems: tender.boq?.boqData as any[] || []
    };

    const htmlContent = generateAiSummaryHtml(aiData);

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'load' });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    await browser.close();

    return Buffer.from(pdfBuffer);
  }

  async getAiSummaryHtmlContent(id: string): Promise<string> {
    const tender = await this.prisma.tender.findUnique({
      where: { id },
      include: { boq: true }
    });

    if (!tender) {
      throw new NotFoundException("Tender not found");
    }

    if (!tender.aiSummary) {
      throw new InternalServerErrorException("AI Summary is not generated yet for this tender");
    }

    const aiData: AiSummaryData = {
      authorityName: tender.invitingAuthorityName || 'N/A',
      tdrNumber: tender.tenderId || tender.tenderCode || 'N/A',
      location: tender.location || tender.city || 'N/A',
      tenderValue: tender.tenderValue ? tender.tenderValue.toString() : 'N/A',
      emd: tender.emd ? tender.emd.toString() : 'N/A',
      tenderFee: tender.applicationCost || 'N/A',
      submissionDate: tender.endDate ? new Date(tender.endDate).toLocaleDateString() : 'N/A',
      contractPeriod: tender.periodOfWorkDays ? `${tender.periodOfWorkDays} Days` : 'N/A',
      workDescription: tender.title || 'N/A',
      scopeOfWork: tender.aiSummary ? tender.aiSummary.split('\n').map(s => s.trim().replace(/^- /, '')).filter(Boolean) : [tender.title || 'N/A'],
      keyDates: [
        { label: 'Start Date', value: tender.publishedDate ? new Date(tender.publishedDate).toLocaleDateString() : 'N/A' },
        { label: 'Bid Submission Date', value: tender.docDownloadEndDate ? new Date(tender.docDownloadEndDate).toLocaleDateString() : 'N/A' },
        { label: 'Bid Opening Date', value: tender.bidOpeningDate ? new Date(tender.bidOpeningDate).toLocaleDateString() : 'N/A' },
        { label: 'Closing Date', value: tender.endDate ? new Date(tender.endDate).toLocaleDateString() : 'N/A' },
        { label: 'Contract Period', value: tender.periodOfWorkDays ? `${tender.periodOfWorkDays} Days` : 'N/A' }
      ],
      locationAndContact: [
        { label: 'City', value: tender.city || 'N/A' },
        { label: 'State', value: tender.state || 'N/A' },
        { label: 'Pincode', value: tender.pincode || 'N/A' },
        { label: 'Address', value: tender.invitingAuthorityAddress || 'N/A' },
        { label: 'Contact Person', value: tender.invitingAuthorityName || 'N/A' },
        { label: 'Tender Portal Link', value: tender.sourceUrl || 'N/A' }
      ],
      basicDetail: [],
      finance: [],
      technicalQualification: [],
      exemptions: [],
      documentList: [],
      boqItems: tender.boq?.boqData as any[] || []
    };

    return generateAiSummaryHtml(aiData);
  }

  async createTender(dto: CreateTenderDto) {
    const data = {
      ...dto,
      sourceUrl: dto.sourceUrl || `manual-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    };
    return this.prisma.tender.create({ data });
  }

  async updateTender(id: string, dto: UpdateTenderDto) {
    return this.prisma.tender.update({
      where: { id },
      data: dto,
    });
  }

  async getSidebarStats() {
    const KEYWORDS = [
      "Road", "Bridge", "Hospital", "School", "Water Supply", "Solar",
      "Construction", "Software", "Electrical", "Drainage", "Railway",
      "Building", "Irrigation", "Civil", "Sewage", "Power", "Sanitation"
    ];

    const now = new Date();

    const stateGroups = await this.prisma.tender.groupBy({
      by: ['state'],
      where: { state: { not: null }, endDate: { gte: now } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    const cityGroups = await this.prisma.tender.groupBy({
      by: ['city'],
      where: { city: { not: null }, endDate: { gte: now } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 30,
    });

    const keywordCounts = await Promise.all(
      KEYWORDS.map(kw => {
        const kwSearch = { contains: kw, mode: 'insensitive' as const };
        return this.prisma.tender.count({
          where: {
            endDate: { gte: now },
            OR: [
              { title: kwSearch },
              { description: kwSearch },
              { state: kwSearch },
              { district: kwSearch },
              { city: kwSearch },
              { organisation: kwSearch },
              { tenderCategory: kwSearch },
            ],
          },
        });
      })
    );

    const keywords = KEYWORDS
      .map((kw, i) => ({ keyword: kw, count: keywordCounts[i] as number }))
      .filter(k => k.count > 0)
      .sort((a, b) => b.count - a.count);

    const toTitleCase = (str: string) => {
      return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    };

    const aggregateCounts = (groups: { name: string, count: number }[]) => {
      const map: Record<string, number> = {};
      for (const item of groups) {
        if (!item.name) continue;
        const normalized = toTitleCase(item.name.trim());
        map[normalized] = (map[normalized] || 0) + item.count;
      }
      return Object.entries(map)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
    };

    const rawStates = stateGroups.map(s => ({ name: s.state as string, count: s._count.id }));
    const states = aggregateCounts(rawStates);

    const rawCities = cityGroups.map(c => ({ name: c.city as string, count: c._count.id }));
    const cities = aggregateCounts(rawCities).slice(0, 30); // keep max 30 after aggregation

    return { states, cities, keywords };
  }

  async getFiltersAggregate() {
    const stats = await this.getSidebarStats();
    const now = new Date();
    const [under10L, tenTo50L, fiftyLTo1Cr, above1Cr] = await Promise.all([
      this.prisma.tender.count({ where: { endDate: { gte: now }, tenderAmount: { lt: 1000000 } } }),
      this.prisma.tender.count({ where: { endDate: { gte: now }, tenderAmount: { gte: 1000000, lt: 5000000 } } }),
      this.prisma.tender.count({ where: { endDate: { gte: now }, tenderAmount: { gte: 5000000, lt: 10000000 } } }),
      this.prisma.tender.count({ where: { endDate: { gte: now }, tenderAmount: { gte: 10000000 } } })
    ]);

    return {
      keywords: stats.keywords.map(k => ({ name: k.keyword, count: k.count })),
      states: stats.states,
      tenderValues: [
        { name: "Under 10 Lakhs", count: under10L },
        { name: "10 - 50 Lakhs", count: tenTo50L },
        { name: "50 Lakhs - 1 Crore", count: fiftyLTo1Cr },
        { name: "Above 1 Crore", count: above1Cr }
      ]
    };
  }

  async autocomplete(q: string) {
    if (!q || q.trim().length < 2) return [];
    
    const query = q.trim();
    const insensitiveQuery = { contains: query, mode: 'insensitive' as const };
    
    const [states, cities, authorities] = await Promise.all([
      this.prisma.tender.findMany({
        where: { state: insensitiveQuery },
        select: { state: true },
        distinct: ['state'],
        take: 10
      }),
      this.prisma.tender.findMany({
        where: { OR: [{ city: insensitiveQuery }, { district: insensitiveQuery }] },
        select: { city: true, district: true },
        distinct: ['city', 'district'],
        take: 20
      }),
      this.prisma.tender.findMany({
        where: { organisation: insensitiveQuery },
        select: { organisation: true },
        distinct: ['organisation'],
        take: 10
      })
    ]);

    const suggestions: { text: string; type: string; category: string }[] = [];

    states.forEach(s => {
      if (s.state) suggestions.push({ text: s.state, type: 'State', category: 'states' });
    });

    cities.forEach(c => {
      if (c.city && c.city.toLowerCase().includes(query.toLowerCase())) {
        suggestions.push({ text: c.city, type: 'City', category: 'districts' });
      }
      if (c.district && c.district.toLowerCase().includes(query.toLowerCase())) {
        suggestions.push({ text: c.district, type: 'District', category: 'districts' });
      }
    });

    authorities.forEach(a => {
      if (a.organisation) suggestions.push({ text: a.organisation, type: 'Authority', category: 'authorities' });
    });

    // Deduplicate exact matches inside the same category
    const unique: typeof suggestions = [];
    const seen = new Set();
    for (const item of suggestions) {
      const key = `${item.text}-${item.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(item);
      }
    }

    return unique;
  }

  async getAuthorities(state?: string) {
    const where: any = {};
    if (state && state !== "All States") {
      where.state = { contains: state, mode: 'insensitive' };
    }
    const result = await this.prisma.tender.groupBy({
      by: ['organisation'],
      where,
      _count: { organisation: true },
      orderBy: { _count: { organisation: 'desc' } }
    });
    return result.map(r => r.organisation).filter(Boolean);
  }
}
