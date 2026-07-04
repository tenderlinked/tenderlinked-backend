import { Controller, Post, Body, Get, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('profile')
  async createProfile(
    @Body() body: { userId: string; email?: string; phoneNumber?: string; companyName?: string; username?: string },
  ) {
    return this.usersService.createProfile(body.userId, body.email, body.phoneNumber, body.companyName, body.username);
  }

  @Get('profile/:userId')
  async getProfile(@Param('userId') userId: string, @Query('email') email?: string, @Req() req?: any) {
    let isKeycloakSuperAdmin = false;
    const authHeader = req?.headers?.['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const payloadBase64 = token.split('.')[1];
        const decodedPayload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
        const roles = decodedPayload?.realm_access?.roles || [];
        if (roles.includes('SUPER_ADMIN') || roles.includes('super_admin')) {
          isKeycloakSuperAdmin = true;
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
    
    return this.usersService.getProfile(userId, email, isKeycloakSuperAdmin);
  }

  @Get('profile/check-phone/:phone')
  async checkPhone(@Param('phone') phone: string) {
    return this.usersService.checkPhone(phone);
  }

  @Post(':userId/super-admin')
  @ApiOperation({ summary: "Promote a user to Super Admin" })
  @UseGuards(SuperAdminGuard)
  async promoteToSuperAdmin(@Param('userId') userId: string) {
    return this.usersService.promoteToSuperAdmin(userId);
  }
}
