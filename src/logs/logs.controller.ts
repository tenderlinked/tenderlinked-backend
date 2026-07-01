import { Controller, Get, Query, InternalServerErrorException } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { LogsService } from "./logs.service";

@ApiTags("Logs")
@Controller("logs")
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get("scrape")
  @ApiOperation({ summary: "Get paginated scrape logs" })
  @ApiQuery({ name: "page", required: false, description: "Page number" })
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
