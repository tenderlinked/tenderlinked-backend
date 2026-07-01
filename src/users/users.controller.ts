import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('profile')
  async createProfile(
    @Body() body: { userId: string; phoneNumber?: string; companyName?: string },
  ) {
    return this.usersService.createProfile(body.userId, body.phoneNumber, body.companyName);
  }

  @Get('profile/:userId')
  async getProfile(@Param('userId') userId: string) {
    return this.usersService.getProfile(userId);
  }

  @Get('profile/check-phone/:phone')
  async checkPhone(@Param('phone') phone: string) {
    return this.usersService.checkPhone(phone);
  }
}
