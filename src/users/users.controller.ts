import { Controller, Post, Body, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';

@ApiTags('Users')
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
  async getProfile(@Param('userId') userId: string, @Query('email') email?: string) {
    return this.usersService.getProfile(userId, email);
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
