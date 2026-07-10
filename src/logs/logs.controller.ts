import { Controller, Get, Query, InternalServerErrorException, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { LogsService } from "./logs.service";
import { SuperAdminGuard } from "../auth/guards/super-admin.guard";

@ApiTags("Logs")
@Controller("logs")
@UseGuards(SuperAdminGuard)
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get("scrape")
  @ApiOperation({ summary: "Get paginated scrape logs" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@ApiQuery({ name: "page", required: false, description: "Page number" })
  @ApiQuery({ name: "pageSize", required: false, description: "Page size" })
  async getScrapeLogs(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ) {
    try {
      return await this.logsService.getScrapeLogs(
        parseInt(page || "1", 10),
        parseInt(pageSize || "20", 10)
      );
    } catch (error: any) {
      console.error("[GET /logs/scrape] Error:", error);
      throw new InternalServerErrorException({
        error: "Internal Server Error",
        details: error?.message || String(error),
      });
    }
  }
}
