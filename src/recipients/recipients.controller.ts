import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  InternalServerErrorException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiQuery, ApiBody } from "@nestjs/swagger";
import { RecipientsService } from "./recipients.service";

@ApiTags("Recipients")
@Controller("recipients")
export class RecipientsController {
  constructor(private readonly recipientsService: RecipientsService) {}

  @Get()
  @ApiOperation({ summary: "Get all email recipients" })
  async getAll() {
    try {
      const data = await this.recipientsService.findAll();
      return { success: true, data };
    } catch (error: any) {
      throw new InternalServerErrorException(error.message);
    }
  }

  @Post()
  @ApiOperation({ summary: "Add a new email recipient" })
  @ApiBody({ schema: { properties: { email: { type: "string", description: "Email address of the recipient" } } } })
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
  @ApiQuery({ name: "id", required: true, description: "Recipient ID" })
  async remove(@Query("id") id: string) {
    try {
      await this.recipientsService.remove(id);
      return { success: true };
    } catch (error: any) {
      throw new InternalServerErrorException(error.message);
    }
  }
}
