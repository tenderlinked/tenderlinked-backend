import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TendersService {
  constructor(private readonly prisma: PrismaService) {}

  async getTenders(params: {
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
  }) {
    const {
      district, search, active, priority, page, pageSize, date, excludeToday, tenderType
    } = params;

    const keywords = await this.prisma.priorityKeyword.findMany();
    const keywordList = keywords.map((k: any) => k.word);

    const where: any = {};
    const AND: any[] = [];

    // Map legacy tenderType to new unified geographic metadata
    if (tenderType === "state") {
      where.level = "STATE";
      if (district) where.organisation = district;
    } else if (tenderType === "district") {
      where.level = "DISTRICT";
      if (district) where.district = district;
    } else if (district) {
      AND.push({ OR: [{ district }, { organisation: district }] });
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
        ],
      });
    }

    if (active === "true") {
      const now = new Date();
      AND.push({ OR: [{ endDate: { gte: now } }, { endDate: null }] });
    } else if (active === "false") {
      where.endDate = { lt: new Date() };
    }

    if (AND.length > 0) where.AND = AND;

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [tenders, total, pendingQueue] = await Promise.all([
      this.prisma.tender.findMany({
        where, skip, take, orderBy: [{ startDate: "desc" }, { createdAt: "desc" }]
      }),
      this.prisma.tender.count({ where }),
      this.prisma.tender.count({ where: { aiProcessed: false } }),
    ]);

    const formattedTenders = tenders.map((t: any) => {
      const hasHighPriorityTag = t.tags && t.tags.some((tag: string) => keywordList.some((kw: string) => tag.toLowerCase().includes(kw.toLowerCase())));
      const titleMatch = keywordList.some((kw: string) => t.title?.toLowerCase().includes(kw.toLowerCase()));
      const summaryMatch = keywordList.some((kw: string) => t.aiSummary?.toLowerCase().includes(kw.toLowerCase()));
      return {
        ...t,
        isHighPriority: hasHighPriorityTag || titleMatch || summaryMatch,
        // TODO: In Phase 3, this will be fetched from TenantTenderAction using the authenticated user's tenantId
        isBookmarked: false,
        isApplied: false,
      };
    });

    return {
      success: true,
      data: formattedTenders,
      meta: { total, pendingQueue, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  // TODO: Update these methods in Phase 3 to use TenantTenderAction
  async updateBookmark(id: string, isBookmarked: boolean, isState: boolean) {
    return { success: true, message: "Bookmark endpoint requires Tenant Context (Phase 3)" };
  }

  async updateApplied(id: string, isApplied: boolean, isState: boolean) {
    return { success: true, message: "Applied endpoint requires Tenant Context (Phase 3)" };
  }

  async retryAi(id: string, isState: boolean) {
    return this.prisma.tender.update({
      where: { id },
      data: { aiProcessed: false, aiError: null },
    });
  }
}
