import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
  HttpException,
  Req,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { ApiTags, ApiOperation, ApiQuery, ApiBody, ApiResponse } from '@nestjs/swagger';
import { TendersService } from "./tenders.service";
import { TenantRoleGuard } from "../auth/guards/tenant-role.guard";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { UseGuards } from "@nestjs/common";
import { CreateTenderDto } from "./dto/create-tender.dto";
import { UpdateTenderDto } from "./dto/update-tender.dto";
import { CreditsService } from "../credits/credits.service";

@ApiTags("Tenders")
@Controller("tenders")
export class TendersController {
  constructor(
    private readonly tendersService: TendersService,
    private readonly creditsService: CreditsService
  ) {}

  @Get()
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('tenders:read')
  @ApiOperation({ summary: "Get a paginated list of tenders" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@ApiQuery({ name: "district", required: false, description: "Filter by district" })
  @ApiQuery({ name: "search", required: false, description: "Search term" })
  @ApiQuery({ name: "active", required: false, description: "Filter by active status (true/false/expiring)" })
  @ApiQuery({ name: "priority", required: false, description: "Filter by priority (HIGH)" })
  @ApiQuery({ name: "page", required: false, description: "Page number" })
  @ApiQuery({ name: "pageSize", required: false, description: "Page size" })
  @ApiQuery({ name: "date", required: false, description: "Exact date (YYYY-MM-DD)" })
  @ApiQuery({ name: "excludeToday", required: false, description: "Exclude tenders from today (true)" })
  @ApiQuery({ name: "bookmarked", required: false, description: "Filter bookmarked (true)" })
  @ApiQuery({ name: "applied", required: false, description: "Filter applied (true)" })
  @ApiQuery({ name: "dateRange", required: false, description: "Filter by date range (this_week)" })
  @ApiQuery({ name: "includeStats", required: false, description: "Include stats in metadata (true)" })
  @ApiQuery({ name: "tenderType", required: false, description: "Type of tender (state/district)" })
  @ApiQuery({ name: "state", required: false, description: "Filter by state" })
  @ApiQuery({ name: "category", required: false, description: "Filter by category" })
  @ApiQuery({ name: "authority", required: false, description: "Filter by authority" })
  async getTenders(
    @Query("district") district?: string,
    @Query("search") search?: string,
    @Query("active") active?: string,
    @Query("priority") priority?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("date") date?: string,
    @Query("excludeToday") excludeToday?: string,
    @Query("bookmarked") bookmarked?: string,
    @Query("applied") applied?: string,
    @Query("dateRange") dateRange?: string,
    @Query("includeStats") includeStats?: string,
    @Query("tenderType") tenderType?: string,
    @Query("states") statesParam?: string | string[],
    @Query("districts") districtsParam?: string | string[],
    @Query("categories") categoriesParam?: string | string[],
    @Query("authorities") authoritiesParam?: string | string[],
    @Query("keywords") keywordsParam?: string | string[],
    @Query("minAmount") minAmount?: string,
    @Query("maxAmount") maxAmount?: string,
    @Query("sort") sort?: string,
    @Req() req?: any
  ) {
    try {
      let userId: string | null = null;
      const authHeader = req?.headers?.['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.split(' ')[1];
          const payloadBase64 = token.split('.')[1];
          const decodedPayload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
          userId = decodedPayload.sub;
        } catch (e) {
          // Ignore
        }
      }

      const parseArr = (v?: string | string[]) => {
        if (!v) return [];
        if (Array.isArray(v)) return v.flatMap(s => s.split(',')).filter(Boolean);
        return v.split(',').filter(Boolean);
      };

      return await this.tendersService.getTenders({
        userId,
        search: search || null,
        active: active || null,
        priority: priority || null,
        page: parseInt(page || "1", 10),
        pageSize: parseInt(pageSize || "20", 10),
        date: date || null,
        excludeToday: excludeToday || null,
        bookmarked: bookmarked || null,
        applied: applied || null,
        dateRange: dateRange || null,
        includeStats: includeStats || null,
        tenderType: tenderType || null,
        states: parseArr(statesParam),
        districts: parseArr(districtsParam),
        categories: parseArr(categoriesParam),
        authorities: parseArr(authoritiesParam),
        sidebarKeywords: parseArr(keywordsParam),
        minAmount: minAmount ? parseFloat(minAmount) : null,
        maxAmount: maxAmount ? parseFloat(maxAmount) : null,
        sort: sort || null,
      });
    } catch (error: any) {
      console.error("[GET /tenders] Error:", error);
      throw new InternalServerErrorException({
        error: "Internal Server Error",
        details: error?.message || String(error),
      });
    }
  }

  @Get('autocomplete')
  @ApiOperation({ summary: "Get autocomplete suggestions for global search" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@ApiQuery({ name: "q", required: true, description: "Search query" })
  async autocomplete(@Query("q") q: string) {
    return this.tendersService.autocomplete(q);
  }

  @Get('sidebar-stats')
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('tenders:read')
  @ApiOperation({ summary: "Get sidebar stats: states, cities, and keywords with tender counts" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })
  async getSidebarStats() {
    return this.tendersService.getSidebarStats();
  }

  @Get('filters/aggregate')
  @ApiOperation({ summary: "Get aggregate counts for states, keywords, and tender values" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  async getFiltersAggregate() {
    return this.tendersService.getFiltersAggregate();
  }

  @Get('stats/home')
  @ApiOperation({ summary: "Get high-level stats for the home page" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  async getHomeStats() {
    return this.tendersService.getHomeStats();
  }

  @Get('metadata/mega-menu')
  @ApiOperation({ summary: "Get real data for the navigation mega menu" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  async getMegaMenu() {
    return this.tendersService.getMegaMenu();
  }

  @Get('metadata/dropdowns')
  @ApiOperation({ summary: "Get distinct dropdown options for tender metadata" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  async getMetadataDropdowns() {
    return this.tendersService.getMetadataDropdowns();
  }

  @Get('authorities')
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('tenders:read')
  @ApiOperation({ summary: "Get a list of distinct authorities (organisations) for a state" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@ApiQuery({ name: "state", required: false, description: "Filter by state" })
  async getAuthorities(@Query("state") state?: string) {
    return this.tendersService.getAuthorities(state);
  }

  @Get('recently-viewed')
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('tenders:read')
  @ApiOperation({ summary: "Get recently viewed tenders for the current user" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  async getRecentlyViewedTenders(@Req() req: any) {
    let userId: string | null = null;
    const authHeader = req?.headers?.['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const payloadBase64 = token.split('.')[1];
        const decodedPayload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
        userId = decodedPayload.sub;
      } catch (e) {
        // Ignore
      }
    }
    
    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }

    try {
      const data = await this.tendersService.getRecentlyViewedTenders(userId);
      return { success: true, data };
    } catch (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  @Get(':id')
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('tenders:read')
  @ApiOperation({ summary: "Get a specific tender by ID" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })async getTenderById(
    @Param('id') id: string,
    @Req() req?: any
  ) {
    try {
      let userId: string | null = null;
      const authHeader = req?.headers?.['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.split(' ')[1];
          const payloadBase64 = token.split('.')[1];
          const decodedPayload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
          userId = decodedPayload.sub;
        } catch (e) {
          // Ignore
        }
      }

      const tender = await this.tendersService.getTenderById(id, userId);
      if (!tender) {
        throw new BadRequestException("Tender not found");
      }
      return { success: true, data: tender };
    } catch (error: any) {
      console.error(`[GET /tenders/${id}] Error:`, error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException({
        error: "Internal Server Error",
        details: error?.message || String(error),
      });
    }
  }

  @Patch(':id')
  @UseGuards(TenantRoleGuard)
  @ApiOperation({ summary: "Update a specific tender by ID (Super Admin only)" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })
  async updateTender(
    @Param('id') id: string,
    @Body() dto: UpdateTenderDto,
    @Req() req?: any
  ) {
    try {
      let userId: string | null = null;
      const authHeader = req?.headers?.['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.split(' ')[1];
          const payloadBase64 = token.split('.')[1];
          const decodedPayload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
          userId = decodedPayload.sub;
        } catch (e) {}
      }

      if (!userId) {
        throw new UnauthorizedException("User not authenticated");
      }

      const tender = await this.tendersService.updateTender(id, dto, userId);
      return { success: true, data: tender };
    } catch (error: any) {
      console.error(`[PATCH /tenders/${id}] Error:`, error);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException({
        error: "Internal Server Error",
        details: error?.message || String(error),
      });
    }
  }

  @Get(':id/ai-status')
  @ApiOperation({ summary: "Get AI processing status for a specific tender without incrementing view count" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  async getTenderAiStatus(@Param('id') id: string) {
    try {
      const tender = await this.tendersService.getTenderAiStatus(id);
      if (!tender) {
        throw new BadRequestException("Tender not found");
      }
      return { success: true, data: tender };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException("Internal Server Error");
    }
  }

  @Get(':id/recommendations')
  @ApiOperation({ summary: "Get related tenders and view also recommendations for a specific tender" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  async getTenderRecommendations(@Param('id') id: string) {
    try {
      const recommendations = await this.tendersService.getRecommendations(id);
      return { success: true, data: recommendations };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException("Internal Server Error");
    }
  }

  @Get(':id/documents')
  @ApiOperation({ summary: "Get downloaded documents for a specific tender" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })async getTenderDocuments(
    @Param('id') id: string,
    @Req() req?: any
  ) {
    try {
      let userId: string | null = null;
      const authHeader = req?.headers?.['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.split(' ')[1];
          const payloadBase64 = token.split('.')[1];
          const decodedPayload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
          userId = decodedPayload.sub;
        } catch (e) {
          // Ignore
        }
      }

      const documents = await this.tendersService.getTenderDocuments(id, userId);
      return { success: true, data: documents };
    } catch (error: any) {
      console.error(`[GET /tenders/${id}/documents] Error:`, error);
      throw new InternalServerErrorException({
        error: "Internal Server Error",
        details: error?.message || String(error),
      });
    }
  }

  @Get(':id/download-all')
  @ApiOperation({ summary: "Download all documents as a zip file" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })async downloadAllDocuments(
    @Param('id') id: string,
    @Res() res: Response,
    @Query('token') token?: string
  ) {
    try {
      if (!token) {
        return res.status(401).json({ error: "Unauthorized. Token required for download." });
      }
      let userId: string | null = null;
      try {
        const payloadBase64 = token.split('.')[1];
        const decodedPayload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
        userId = decodedPayload.sub;
      } catch (e) {
        return res.status(401).json({ error: "Invalid token." });
      }

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized." });
      }

      try {
        // This will deduct 1 credit if not already unlocked
        await this.creditsService.unlockTender(userId, id);
      } catch (e: any) {
        return res.status(403).json({ error: e.message || "Insufficient credits" });
      }

      await this.tendersService.downloadAllDocuments(id, res);
    } catch (error: any) {
      console.error(`[GET /tenders/${id}/download-all] Error:`, error);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          details: error?.message || String(error),
        });
      }
    }
  }

  @Patch(":id/bookmark")
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('tenders:read')
  @ApiOperation({ summary: "Update bookmark status of a tender" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@ApiBody({ schema: { properties: { isBookmarked: { type: "boolean" }, isState: { type: "boolean", default: false } } } })
  async updateBookmark(
    @Param("id") id: string,
    @Body() body: { isBookmarked: boolean; isState?: boolean },
    @Req() req: any
  ) {
    if (typeof body.isBookmarked !== "boolean") {
      throw new BadRequestException("Invalid data: isBookmarked must be a boolean");
    }

    let userId: string | null = null;
    const authHeader = req?.headers?.['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const payloadBase64 = token.split('.')[1];
        const decodedPayload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
        userId = decodedPayload.sub;
      } catch (e) {}
    }
    if (!userId) throw new UnauthorizedException("User ID missing from token");

    try {
      const updated = await this.tendersService.updateBookmark(
        id,
        body.isBookmarked,
        body.isState ?? false,
        userId
      );
      return { success: true, data: updated };
    } catch (error) {
      console.error("[PATCH /tenders/:id/bookmark] Error:", error);
      throw new InternalServerErrorException("Internal Server Error");
    }
  }

  @Patch(":id/applied")
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('tenders:read')
  @ApiOperation({ summary: "Update applied status of a tender" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@ApiBody({ schema: { properties: { isApplied: { type: "boolean" }, isState: { type: "boolean", default: false } } } })
  async updateApplied(
    @Param("id") id: string,
    @Body() body: { isApplied: boolean; isState?: boolean },
    @Req() req: any
  ) {
    if (typeof body.isApplied !== "boolean") {
      throw new BadRequestException("Invalid data: isApplied must be a boolean");
    }

    let userId: string | null = null;
    const authHeader = req?.headers?.['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const payloadBase64 = token.split('.')[1];
        const decodedPayload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
        userId = decodedPayload.sub;
      } catch (e) {}
    }
    if (!userId) throw new UnauthorizedException("User ID missing from token");

    try {
      const updated = await this.tendersService.updateApplied(
        id,
        body.isApplied,
        body.isState ?? false,
        userId
      );
      return { success: true, data: updated };
    } catch (error) {
      console.error("[PATCH /tenders/:id/applied] Error:", error);
      throw new InternalServerErrorException("Internal Server Error");
    }
  }

  @Patch(":id/retry-ai")
  @UseGuards(TenantRoleGuard)
  @ApiOperation({ summary: "Retry AI processing for a tender" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@ApiQuery({ name: "state", required: false, description: "Is this a state tender (true)" })
  async retryAi(
    @Param("id") id: string,
    @Query("state") state?: string
  ) {
    try {
      const isState = state === "true";
      await this.tendersService.retryAi(id, isState);
      return { success: true };
    } catch (error) {
      console.error("[PATCH /tenders/:id/retry-ai] Error:", error);
      throw new InternalServerErrorException("Internal Server Error");
    }
  }

  @Get(":id/ai-summary-pdf")
  @UseGuards(TenantRoleGuard)
  @ApiOperation({ summary: "Get AI Summary as PDF" })
  @ApiResponse({ status: 200, description: 'Returns PDF buffer' })
  async getAiSummaryPdf(@Param("id") id: string, @Res() res: Response) {
    try {
      const pdfBuffer = await this.tendersService.getAiSummaryPdf(id);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="AI_Tender_Summary_${id.slice(0,8)}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error("[GET /tenders/:id/ai-summary-pdf] Error:", error.message);
      throw new InternalServerErrorException(error.message);
    }
  }

  @Get(":id/ai-summary-html")
  @UseGuards(TenantRoleGuard)
  @ApiOperation({ summary: "Get exact AI Summary HTML" })
  @ApiResponse({ status: 200, description: 'Returns exact HTML string' })
  async getAiSummaryHtml(@Param("id") id: string, @Res() res: Response) {
    try {
      const htmlString = await this.tendersService.getAiSummaryHtmlContent(id);
      res.set({
        'Content-Type': 'text/html',
      });
      res.send(htmlString);
    } catch (error: any) {
      console.error("[GET /tenders/:id/ai-summary-html] Error:", error.message);
      throw new InternalServerErrorException(error.message);
    }
  }

  // -------------------------------------------------
  //  UNLOCK AI SUMMARY
  // -------------------------------------------------
  @Post(':id/unlock-ai')
  @UseGuards(TenantRoleGuard)
  @ApiOperation({ summary: "Unlock AI Summary with Credit" })
  @ApiResponse({ status: 200, description: 'Successful unlock' })
  async unlockAiSummary(@Param("id") id: string, @Req() req: any) {
    try {
      const authHeader = req?.headers?.['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException('Missing token');
      }
      const token = authHeader.split(' ')[1];
      const payloadBase64 = token.split('.')[1];
      const decodedPayload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
      const userId = decodedPayload.sub;
      if (!userId) throw new UnauthorizedException('Invalid token payload');

      // We use the existing credits service which handles deducting a credit 
      // and permanently recording the unlock in TenantUnlockedTender
      return await this.creditsService.unlockTender(userId, id);
    } catch (error: any) {
      console.error("[POST /tenders/:id/unlock-ai] Error:", error.message);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(error.message);
    }
  }

  // -------------------------------------------------
  //  CREATE – only users with `tenders:write`
  // -------------------------------------------------
  @Post()
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('tenders:write')
  @ApiOperation({ summary: 'Create a new Tender (Super‑Admin or tenant member granted permission)' })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@ApiBody({ type: CreateTenderDto })
  async create(@Body() dto: CreateTenderDto) {
    try {
      return await this.tendersService.createTender(dto);
    } catch (e) {
      console.error('[POST /tenders] Error:', e);
      throw new InternalServerErrorException('Failed to create tender');
    }
  }

  // -------------------------------------------------
}
