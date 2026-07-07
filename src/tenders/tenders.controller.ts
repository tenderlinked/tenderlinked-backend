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
  Req,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiQuery, ApiBody, ApiBearerAuth } from "@nestjs/swagger";
import { TendersService } from "./tenders.service";
import { TenantRoleGuard } from "../auth/guards/tenant-role.guard";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { UseGuards } from "@nestjs/common";
import { CreateTenderDto } from "./dto/create-tender.dto";
import { UpdateTenderDto } from "./dto/update-tender.dto";

@ApiTags("Tenders")
@ApiBearerAuth()
@Controller("tenders")
export class TendersController {
  constructor(private readonly tendersService: TendersService) {}

  @Get()
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('tenders:read')
  @ApiOperation({ summary: "Get a paginated list of tenders" })
  @ApiQuery({ name: "district", required: false, description: "Filter by district" })
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
    @Query("state") state?: string,
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

      return await this.tendersService.getTenders({
        userId,
        district: district || null,
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
        state: state || null,
      });
    } catch (error: any) {
      console.error("[GET /tenders] Error:", error);
      throw new InternalServerErrorException({
        error: "Internal Server Error",
        details: error?.message || String(error),
      });
    }
  }

  @Get(':id')
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('tenders:read')
  @ApiOperation({ summary: "Get a specific tender by ID" })
  async getTenderById(
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
      throw new InternalServerErrorException({
        error: "Internal Server Error",
        details: error?.message || String(error),
      });
    }
  }

  @Patch(":id/bookmark")
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('tenders:read')
  @ApiOperation({ summary: "Update bookmark status of a tender" })
  @ApiBody({ schema: { properties: { isBookmarked: { type: "boolean" }, isState: { type: "boolean", default: false } } } })
  async updateBookmark(
    @Param("id") id: string,
    @Body() body: { isBookmarked: boolean; isState?: boolean }
  ) {
    if (typeof body.isBookmarked !== "boolean") {
      throw new BadRequestException("Invalid data: isBookmarked must be a boolean");
    }
    try {
      const updated = await this.tendersService.updateBookmark(
        id,
        body.isBookmarked,
        body.isState ?? false
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
  @ApiBody({ schema: { properties: { isApplied: { type: "boolean" }, isState: { type: "boolean", default: false } } } })
  async updateApplied(
    @Param("id") id: string,
    @Body() body: { isApplied: boolean; isState?: boolean }
  ) {
    if (typeof body.isApplied !== "boolean") {
      throw new BadRequestException("Invalid data: isApplied must be a boolean");
    }
    try {
      const updated = await this.tendersService.updateApplied(
        id,
        body.isApplied,
        body.isState ?? false
      );
      return { success: true, data: updated };
    } catch (error) {
      console.error("[PATCH /tenders/:id/applied] Error:", error);
      throw new InternalServerErrorException("Internal Server Error");
    }
  }

  @Patch(":id/retry-ai")
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('settings:manage')
  @ApiOperation({ summary: "Retry AI processing for a tender" })
  @ApiQuery({ name: "state", required: false, description: "Is this a state tender (true)" })
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

  // -------------------------------------------------
  //  CREATE – only users with `tenders:write`
  // -------------------------------------------------
  @Post()
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('tenders:write')
  @ApiOperation({ summary: 'Create a new Tender (Super‑Admin or tenant member granted permission)' })
  @ApiBody({ type: CreateTenderDto })
  async create(@Body() dto: CreateTenderDto) {
    try {
      return await this.tendersService.createTender(dto);
    } catch (e) {
      console.error('[POST /tenders] Error:', e);
      throw new InternalServerErrorException('Failed to create tender');
    }
  }

  // -------------------------------------------------
  //  UPDATE – only users with `tenders:write`
  // -------------------------------------------------
  @Patch(':id')
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('tenders:write')
  @ApiOperation({ summary: 'Update an existing Tender (Super‑Admin or tenant member granted permission)' })
  @ApiBody({ type: UpdateTenderDto })
  async update(@Param('id') id: string, @Body() dto: UpdateTenderDto) {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('No fields provided for update');
    }
    try {
      return await this.tendersService.updateTender(id, dto);
    } catch (e) {
      console.error('[PATCH /tenders/:id] Error:', e);
      throw new InternalServerErrorException('Failed to update tender');
    }
  }
}
