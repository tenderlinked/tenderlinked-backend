import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  Put,
  UseGuards,
  InternalServerErrorException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiQuery, ApiBody } from "@nestjs/swagger";
import { KeywordsService } from "./keywords.service";
import { TenantRoleGuard } from '../auth/guards/tenant-role.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@ApiTags("Keywords")
@Controller("keywords")
export class KeywordsController {
  constructor(private readonly keywordsService: KeywordsService) {}

  @Get()
  @ApiOperation({ summary: "Get all keywords" })
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('keywords:read')
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
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('keywords:manage')
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
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('keywords:manage')
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

  @Post('expansions')
  @ApiOperation({ summary: "Manually add a keyword to the expansion dictionary" })
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('keywords:manage')
  @ApiBody({ schema: { properties: { baseWord: { type: "string" }, expansions: { type: "array", items: { type: "string" } }, status: { type: "string" } } } })
  async createExpansion(@Body() body: { baseWord: string, expansions?: string[], status?: string }) {
    const data = await this.keywordsService.createExpansion(body.baseWord, body.expansions, body.status);
    return { success: true, data };
  }

  @Get('expansions/pending')
  @ApiOperation({ summary: "Get pending keyword expansions" })
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('keywords:read')
  async getPendingExpansions() {
    const data = await this.keywordsService.getPendingExpansions();
    return { success: true, data };
  }

  @Post('expansions/generate-and-save')
  @ApiOperation({ summary: "Generate expansions via AI and save immediately" })
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('keywords:manage')
  @ApiBody({ schema: { properties: { baseWord: { type: "string" } } } })
  async generateAndSaveExpansion(@Body() body: { baseWord: string }) {
    const data = await this.keywordsService.generateAndSaveExpansion(body.baseWord);
    return { success: true, data };
  }

  @Post('expansions/:id/ai-suggest')
  @ApiOperation({ summary: "Auto-expand a keyword using AI" })
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('keywords:manage')
  async autoExpand(@Param('id') id: string) {
    const expansions = await this.keywordsService.autoExpandKeyword(id);
    return { success: true, data: expansions };
  }

  @Post('ai-suggest-new')
  @ApiOperation({ summary: "Suggest expansions for a new word without saving" })
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('keywords:manage')
  @ApiBody({ schema: { properties: { word: { type: "string" } } } })
  async aiSuggestNew(@Body() body: { word: string }) {
    const expansions = await this.keywordsService.generateExpansionsFromAI(body.word);
    return { success: true, data: expansions };
  }

  @Put('expansions/:id/approve')
  @ApiOperation({ summary: "Approve and save expansions" })
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('keywords:manage')
  async approveExpansion(@Param('id') id: string, @Body() body: { expansions: string[] }) {
    const data = await this.keywordsService.approveExpansion(id, body.expansions);
    return { success: true, data };
  }

  @Put('expansions/:id/reject')
  @ApiOperation({ summary: "Reject a keyword expansion" })
  @UseGuards(TenantRoleGuard)
  @RequirePermissions('keywords:manage')
  async rejectExpansion(@Param('id') id: string) {
    const data = await this.keywordsService.rejectExpansion(id);
    return { success: true, data };
  }
}
