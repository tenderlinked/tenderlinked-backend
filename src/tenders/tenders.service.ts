import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { redactTenderBasedOnPlan } from "../common/utils/content-gating.util";
import { CreateTenderDto } from "./dto/create-tender.dto";
import { UpdateTenderDto } from "./dto/update-tender.dto";

@Injectable()
export class TendersService {
  constructor(private readonly prisma: PrismaService) {}

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
  }) {
    const {
      userId, search, active, priority, page, pageSize, date, excludeToday, tenderType,
      states, districts, categories, authorities, minAmount, maxAmount, sidebarKeywords
    } = params;

    const keywords = await this.prisma.priorityKeyword.findMany();
    const keywordList = keywords.map((k: any) => k.word);

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

    // Get user's subscription and pricing plan to determine redaction
    let allowedFields: string[] = [];
    let unlockedTenderIds: Set<string> = new Set();
    
    if (userId) {
      const member = await this.prisma.tenantMember.findFirst({
        where: { userId },
        include: { 
          tenant: { 
            include: { subscription: true } 
          }
        }
      });
      
      if (member?.tenant?.id) {
        // Fetch unlocks for this tenant
        const unlocks = await this.prisma.tenantUnlockedTender.findMany({
          where: { tenantId: member.tenant.id, tenderId: { in: tenders.map(t => t.id) } },
          select: { tenderId: true }
        });
        unlockedTenderIds = new Set(unlocks.map(u => u.tenderId));
      }
      
      if (member?.tenant?.subscription?.planType) {
        const plan = await this.prisma.pricingPlan.findUnique({
          where: { name: member.tenant.subscription.planType }
        });
        if (plan) {
          allowedFields = plan.allowedTenderFields;
        }
      } else {
        // Fallback for default plan if no subscription
        const defaultPlan = await this.prisma.pricingPlan.findFirst({ where: { isDefault: true } });
        if (defaultPlan) allowedFields = defaultPlan.allowedTenderFields;
      }
    } else {
      // Unauthenticated, apply default plan constraints
      const defaultPlan = await this.prisma.pricingPlan.findFirst({ where: { isDefault: true } });
      if (defaultPlan) allowedFields = defaultPlan.allowedTenderFields;
    }

    const formattedTenders = tenders.map((t: any) => {
      const hasHighPriorityTag = t.tags && t.tags.some((tag: string) => keywordList.some((kw: string) => tag.toLowerCase().includes(kw.toLowerCase())));
      const titleMatch = keywordList.some((kw: string) => t.title?.toLowerCase().includes(kw.toLowerCase()));
      const summaryMatch = keywordList.some((kw: string) => t.aiSummary?.toLowerCase().includes(kw.toLowerCase()));
      
      const enhancedTender = {
        ...t,
        isHighPriority: hasHighPriorityTag || titleMatch || summaryMatch,
        // TODO: In Phase 3, this will be fetched from TenantTenderAction using the authenticated user's tenantId
        isBookmarked: false,
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

    return redactTenderBasedOnPlan(enhancedTender, allowedFields, isUnlockedWithCredit);
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

    const [stateGroups, cityGroups, ...keywordCounts] = await Promise.all([
      this.prisma.tender.groupBy({
        by: ['state'],
        where: { state: { not: null }, endDate: { gte: now } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      this.prisma.tender.groupBy({
        by: ['city'],
        where: { city: { not: null }, endDate: { gte: now } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 30,
      }),
      ...KEYWORDS.map(kw => {
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
      }),
    ]);

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
