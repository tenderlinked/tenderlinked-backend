import { Controller, Post, HttpCode, InternalServerErrorException } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { QueueService } from "./queue.service";

@ApiTags("Queue")
@Controller("queue")
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
