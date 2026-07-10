import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  InternalServerErrorException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiQuery, ApiBody, ApiResponse } from '@nestjs/swagger';
import { RecipientsService } from "./recipients.service";
import { UseGuards } from "@nestjs/common";
import { SuperAdminGuard } from "../auth/guards/super-admin.guard";

@ApiTags("Recipients")
@Controller("recipients")
@UseGuards(SuperAdminGuard)
export class RecipientsController {
  constructor(private readonly recipientsService: RecipientsService) {}

  @Get()
  @ApiOperation({ summary: "Get all email recipients" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })async getAll() {
    try {
      const data = await this.recipientsService.findAll();
      return { success: true, data };
    } catch (error: any) {
      throw new InternalServerErrorException(error.message);
    }
  }

  @Post()
  @ApiOperation({ summary: "Add a new email recipient" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@ApiBody({ schema: { properties: { email: { type: "string", description: "Email address of the recipient" } } } })
  async create(@Body() body: { email: string }) {
    try {
      const data = await this.recipientsService.create(body.email);
      return { success: true, data };
    } catch (error: any) {
      throw error;
    }
  }

  @Delete()
  @ApiOperation({ summary: "Delete an email recipient" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@ApiQuery({ name: "id", required: true, description: "Recipient ID" })
  async remove(@Query("id") id: string) {
    try {
      await this.recipientsService.remove(id);
      return { success: true };
    } catch (error: any) {
      throw new InternalServerErrorException(error.message);
    }
  }
}
