import { Controller, Post, Body, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  
  @Post('login')
  @ApiOperation({ summary: 'Login to get an access token for API testing' })
  @ApiBody({ 
    schema: { 
      type: 'object',
      properties: {
        email: { type: 'string', example: 'user@example.com' },
        password: { type: 'string', example: 'password123' }
      },
      required: ['email', 'password']
    } 
  })
  async login(@Body() body: any) {
    if (!body.email || !body.password) {
      throw new UnauthorizedException('Email and password are required');
    }

    const params = new URLSearchParams({
      client_id: 'enfycon-tender',
      client_secret: process.env.KEYCLOAK_CLIENT_SECRET || '',
      grant_type: 'password',
      username: body.email,
      password: body.password,
    });
    
    try {
      const response = await fetch('https://auth.enfycon.com/realms/enfycon-tender/protocol/openid-connect/token', {
         method: 'POST',
         body: params,
         headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      
      if (!response.ok) {
         const error = await response.text();
         console.error('Keycloak Login Error:', error);
         throw new UnauthorizedException('Invalid credentials');
      }
      
      const tokens = await response.json();
      return {
         access_token: tokens.access_token,
         refresh_token: tokens.refresh_token,
         expires_in: tokens.expires_in
      };
    } catch (e: any) {
      if (e instanceof UnauthorizedException) {
        throw e;
      }
      console.error('Login Failed:', e);
      throw new InternalServerErrorException('Failed to communicate with authentication server');
    }
  }
}
