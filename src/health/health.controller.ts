import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags("Health")
@Controller("health")
export class HealthController {
  @Get()
  @ApiOperation({ summary: "Health check" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })check() {
    return { status: "ok" };
  }
}
