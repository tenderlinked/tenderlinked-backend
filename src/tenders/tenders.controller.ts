import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiQuery, ApiBody } from "@nestjs/swagger";
import { TendersService } from "./tenders.service";

@ApiTags("Tenders")
@Controller("tenders")
export class TendersController {
  constructor(private readonly tendersService: TendersService) {}

  @Get()
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
    @Query("tenderType") tenderType?: string
  ) {
    try {
      return await this.tendersService.getTenders({
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
      });
    } catch (error: any) {
      console.error("[GET /tenders] Error:", error);
      throw new InternalServerErrorException({
        error: "Internal Server Error",
        details: error?.message || String(error),
      });
    }
  }

  @Patch(":id/bookmark")
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
}
