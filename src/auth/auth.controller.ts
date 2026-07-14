import { Controller, Post, Body, UnauthorizedException, InternalServerErrorException, BadRequestException, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  
  constructor(private prisma: PrismaService, private emailService: EmailService) {}
  
  @Post('login')
  @ApiOperation({ summary: 'Login to get an access token for API testing' })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' }) @ApiResponse({ status: 201, description: 'Successfully authenticated, returns tokens' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
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

  @Post('send-otp')
  @ApiOperation({ summary: 'Send OTP to phone number' })
  async sendOtp(@Body() body: { phone: string }) {
    if (!body.phone) throw new BadRequestException('Phone number is required');
    
    let mobile = body.phone.replace(/\D/g, '');
    if (mobile.length === 10) {
      mobile = '91' + mobile; // Prefix India country code by default if 10 digits
    }

    const providerSetting = await this.prisma.systemSetting.findUnique({ where: { key: 'SMS_PROVIDER' }});
    const provider = providerSetting?.value || 'MSG91';

    if (provider === 'TWILIO') {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

      if (!accountSid || !authToken || !serviceSid) {
        throw new InternalServerErrorException('Twilio configuration is missing');
      }

      const twilioMobile = mobile.startsWith('+') ? mobile : '+' + mobile;
      const twilioUrl = `https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`;
      
      const params = new URLSearchParams();
      params.append('To', twilioMobile);
      params.append('Channel', 'sms');

      try {
        await axios.post(twilioUrl, params.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          auth: { username: accountSid, password: authToken }
        });
        
        console.log(`\n\n=========================================\n[TWILIO] OTP sent to ${twilioMobile}\n=========================================\n\n`);
        return { success: true, message: 'OTP sent successfully' };
      } catch (error: any) {
        console.error('Failed to send OTP via Twilio:', error?.response?.data || error.message);
        throw new InternalServerErrorException('Failed to communicate with SMS gateway');
      }
    } else {
      // MSG91 Logic
      const authKey = process.env.MSG91_AUTH_KEY;
      const templateId = process.env.MSG91_TEMPLATE_ID;

      if (!authKey || !templateId) {
        throw new InternalServerErrorException('MSG91 configuration is missing');
      }

      const msg91Url = `https://control.msg91.com/api/v5/otp`;

      try {
        const response = await axios.post(
          msg91Url,
          { template_id: templateId, mobile: mobile, otp_length: 6 },
          { headers: { authkey: authKey, 'Content-Type': 'application/json' } }
        );
        
        if (response.data.type === 'error') {
          console.error('MSG91 Send OTP Error:', response.data);
          throw new InternalServerErrorException(response.data.message || 'Failed to send OTP');
        }

        console.log(`\n\n=========================================\n[MSG91] OTP sent to ${mobile}\n=========================================\n\n`);
        return { success: true, message: 'OTP sent successfully' };
      } catch (error: any) {
        console.error('Failed to send OTP via MSG91:', error?.response?.data || error.message);
        if (error instanceof InternalServerErrorException) throw error;
        throw new InternalServerErrorException('Failed to communicate with SMS gateway');
      }
    }
  }

  @Post('verify-otp')
  @ApiOperation({ summary: 'Verify OTP' })
  async verifyOtp(@Body() body: { phone: string, otp: string }) {
    if (!body.phone || !body.otp) throw new BadRequestException('Phone and OTP are required');

    // Allow '000000' as a bypass for local testing
    if (body.otp === '000000') {
      return { success: true, message: 'OTP verified successfully (bypass)' };
    }

    let mobile = body.phone.replace(/\D/g, '');
    if (mobile.length === 10) {
      mobile = '91' + mobile; // Prefix India country code by default if 10 digits
    }

    const providerSetting = await this.prisma.systemSetting.findUnique({ where: { key: 'SMS_PROVIDER' }});
    const provider = providerSetting?.value || 'MSG91';

    if (provider === 'TWILIO') {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

      if (!accountSid || !authToken || !serviceSid) {
        throw new InternalServerErrorException('Twilio configuration is missing');
      }

      const twilioMobile = mobile.startsWith('+') ? mobile : '+' + mobile;
      const twilioUrl = `https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`;
      
      const params = new URLSearchParams();
      params.append('To', twilioMobile);
      params.append('Code', body.otp);

      try {
        const response = await axios.post(twilioUrl, params.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          auth: { username: accountSid, password: authToken }
        });

        if (response.data.status !== 'approved') {
          throw new BadRequestException('Invalid OTP');
        }

        return { success: true, message: 'OTP verified successfully' };
      } catch (error: any) {
        console.error('Failed to verify OTP via Twilio:', error?.response?.data || error.message);
        if (error instanceof BadRequestException) throw error;
        throw new BadRequestException('Invalid or expired OTP');
      }
    } else {
      // MSG91 Logic
      const authKey = process.env.MSG91_AUTH_KEY;
      if (!authKey) {
        throw new InternalServerErrorException('MSG91 configuration is missing');
      }

      const msg91Url = `https://control.msg91.com/api/v5/otp/verify?otp=${body.otp}&mobile=${mobile}`;

      try {
        const response = await axios.get(msg91Url, {
          headers: { authkey: authKey }
        });

        if (response.data.type === 'error') {
          throw new BadRequestException(response.data.message || 'Invalid OTP');
        }

        return { success: true, message: 'OTP verified successfully' };
      } catch (error: any) {
        console.error('Failed to verify OTP via MSG91:', error?.response?.data || error.message);
        if (error instanceof BadRequestException) throw error;
        throw new BadRequestException('Invalid or expired OTP');
      }
    }
  }

  @Get('resolve-identifier')
  @ApiOperation({ summary: 'Resolve phone number to email for Keycloak login, or pass through' })
  async resolveIdentifier(@Query('identifier') identifier: string) {
    if (!identifier) throw new BadRequestException('Identifier is required');

    // If identifier is just digits (phone number), resolve it
    const cleanPhone = identifier.replace(/\D/g, '');
    if (cleanPhone.length >= 10 && !identifier.includes('@')) {
      const profile = await this.prisma.userProfile.findFirst({
        where: { phoneNumber: { contains: cleanPhone } },
        select: { email: true }
      });

      if (!profile || !profile.email) {
        throw new BadRequestException('No account found with this mobile number.');
      }
      return { username: profile.email }; // Return email as the Keycloak username
    }

    // If it's an email or standard username, just pass it through to Keycloak
    return { username: identifier };
  }

  @Post('send-email-otp')
  @ApiOperation({ summary: 'Send an OTP to an email address for password reset' })
  async sendEmailOtp(@Body() body: { email: string }) {
    if (!body.email) throw new BadRequestException('Email is required');

    // Generate 6 digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 minutes expiry

    // Save to OtpVerification table. Note: using the email in the 'phone' column for now 
    // to avoid a Prisma migration.
    await this.prisma.otpVerification.upsert({
      where: { phone: body.email },
      update: { otp, expiresAt },
      create: { phone: body.email, otp, expiresAt }
    });

    // Send the email
    await this.emailService.sendPasswordResetOtp(body.email, otp);
    
    return { success: true, message: 'OTP sent successfully to email' };
  }

  @Post('verify-email-otp')
  @ApiOperation({ summary: 'Verify email OTP and update Keycloak password' })
  async verifyEmailOtp(@Body() body: { email: string, otp: string, newPassword?: string }) {
    if (!body.email || !body.otp || !body.newPassword) {
      throw new BadRequestException('Email, OTP, and newPassword are required');
    }

    // Bypass for local testing
    if (body.otp === '000000') {
      console.log('OTP verified successfully (bypass)');
    } else {
      const record = await this.prisma.otpVerification.findUnique({
        where: { phone: body.email }
      });

      if (!record || record.otp !== body.otp || new Date() > record.expiresAt) {
        throw new BadRequestException('Invalid or expired OTP');
      }

      // Cleanup OTP
      await this.prisma.otpVerification.delete({ where: { id: record.id } });
    }

    // Now update password in Keycloak
    const clientId = 'enfycon-tender';
    const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;
    
    if (!clientSecret) throw new InternalServerErrorException('Keycloak configuration missing');

    try {
      // 1. Get Admin Access Token
      const tokenParams = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials'
      });
      const tokenRes = await fetch('https://auth.enfycon.com/realms/enfycon-tender/protocol/openid-connect/token', {
        method: 'POST',
        body: tokenParams,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) {
        console.error('Failed to get Keycloak Admin Token', tokenData);
        throw new InternalServerErrorException('Authentication provider error');
      }

      // 2. Find the user ID in Keycloak by email
      const usersRes = await fetch(`https://auth.enfycon.com/admin/realms/enfycon-tender/users?email=${encodeURIComponent(body.email)}&exact=true`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      const users = await usersRes.json();
      if (!users || users.length === 0) {
        throw new BadRequestException('User not found in identity provider');
      }
      const kcUserId = users[0].id;

      // 3. Update the password
      const resetRes = await fetch(`https://auth.enfycon.com/admin/realms/enfycon-tender/users/${kcUserId}/reset-password`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'password',
          value: body.newPassword,
          temporary: false
        })
      });

      if (!resetRes.ok) {
        const errorText = await resetRes.text();
        console.error('Failed to reset password in Keycloak:', errorText);
        throw new InternalServerErrorException('Failed to update password');
      }

      return { success: true, message: 'Password reset successfully' };

    } catch (e: any) {
      console.error('Keycloak Password Reset Error:', e);
      if (e instanceof BadRequestException || e instanceof InternalServerErrorException) {
        throw e;
      }
      throw new InternalServerErrorException('Failed to communicate with identity provider');
    }
  }
}
