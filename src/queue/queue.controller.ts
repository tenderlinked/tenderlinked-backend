import { Controller, Post, HttpCode, InternalServerErrorException, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { QueueService } from "./queue.service";
import { SuperAdminGuard } from "../auth/guards/super-admin.guard";

@ApiTags("Queue")
@ApiBearerAuth()
@Controller("queue")
@UseGuards(SuperAdminGuard)
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: "Process AI queue manually" })
  async processQueue() {
    try {
      return await this.queueService.processQueue();
    } catch (error: any) {
      console.error("[AI Queue] Fatal Error:", error);
      throw new InternalServerErrorException(error.message);
    }
  }
}
