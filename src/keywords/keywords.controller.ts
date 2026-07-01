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
import { KeywordsService } from "./keywords.service";

@ApiTags("Keywords")
@Controller("keywords")
export class KeywordsController {
  constructor(private readonly keywordsService: KeywordsService) {}

  @Get()
  @ApiOperation({ summary: "Get all keywords" })
  async getAll() {
    try {
      const data = await this.keywordsService.findAll();
      return { success: true, data };
    } catch (error: any) {
      console.error("Error fetching keywords:", error);
      throw new InternalServerErrorException("Failed to fetch keywords");
    }
  }

  @Post()
  @ApiOperation({ summary: "Create a new keyword" })
  @ApiBody({ schema: { properties: { word: { type: "string" } } } })
  async create(@Body() body: { word: string }) {
    try {
      const keyword = await this.keywordsService.create(body.word);
      return { success: true, data: keyword };
    } catch (error: any) {
      console.error("Error creating keyword:", error);
      throw error;
    }
  }

  @Delete()
  @ApiOperation({ summary: "Delete a keyword" })
  @ApiQuery({ name: "id", required: true, description: "Keyword ID" })
  async remove(@Query("id") id: string) {
    try {
      await this.keywordsService.remove(id);
      return { success: true };
    } catch (error: any) {
      console.error("Error deleting keyword:", error);
      throw new InternalServerErrorException("Failed to delete keyword");
    }
  }
}
