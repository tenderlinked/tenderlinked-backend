import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  Put,
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

  // ---- Expansion Endpoints ----

  @Get('expansions/pending')
  @ApiOperation({ summary: "Get pending keyword expansions" })
  async getPendingExpansions() {
    const data = await this.keywordsService.getPendingExpansions();
    return { success: true, data };
  }

  @Post('expansions/:id/ai-suggest')
  @ApiOperation({ summary: "Auto-expand a keyword using AI" })
  async autoExpand(@Param('id') id: string) {
    const expansions = await this.keywordsService.autoExpandKeyword(id);
    return { success: true, data: expansions };
  }

  @Put('expansions/:id/approve')
  @ApiOperation({ summary: "Approve and save expansions" })
  async approveExpansion(@Param('id') id: string, @Body() body: { expansions: string[] }) {
    const data = await this.keywordsService.approveExpansion(id, body.expansions);
    return { success: true, data };
  }

  @Put('expansions/:id/reject')
  @ApiOperation({ summary: "Reject a keyword expansion" })
  async rejectExpansion(@Param('id') id: string) {
    const data = await this.keywordsService.rejectExpansion(id);
    return { success: true, data };
  }
}
