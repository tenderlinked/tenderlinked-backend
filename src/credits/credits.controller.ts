import { Controller, Post, Get, Param, Req } from '@nestjs/common';
import { CreditsService } from './credits.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TenantRoleGuard } from '../auth/guards/tenant-role.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { UseGuards } from '@nestjs/common';

@ApiTags('Credits')
@Controller()
@UseGuards(TenantRoleGuard)
export class CreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  @Post('tenders/:id/unlock')
  @RequirePermissions('tenders:read')
  @ApiOperation({ summary: 'Spend 1 credit to unlock a tender document' })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })async unlockTender(@Param('id') tenderId: string, @Req() req: any) {
    const userId = this.extractUserId(req);
    if (!userId) return { success: false, message: 'Unauthorized' };
    
    return this.creditsService.unlockTender(userId, tenderId);
  }

  @Get('billing/usage')
  @RequirePermissions('tenders:read')
  @ApiOperation({ summary: 'Get current credit balance and limits' })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })async getUsage(@Req() req: any) {
    const userId = this.extractUserId(req);
    if (!userId) return { availableCredits: 0, tendersViewedThisMonth: 0, maxTenderViews: 0 };
    
    return this.creditsService.getUsage(userId);
  }

  private extractUserId(req: any): string | null {
    const authHeader = req?.headers?.['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const payloadBase64 = token.split('.')[1];
        const decodedPayload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
        return decodedPayload.sub;
      } catch (e) {
        return null;
      }
    }
    return null;
  }
}
