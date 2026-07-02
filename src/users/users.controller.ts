import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';

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
  async getProfile(@Param('userId') userId: string) {
    return this.usersService.getProfile(userId);
  }

  @Get('profile/check-phone/:phone')
  async checkPhone(@Param('phone') phone: string) {
    return this.usersService.checkPhone(phone);
  }
}
