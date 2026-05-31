// Auth controller — Phase 2
// Path A: SMS OTP (field workers) — POST /auth/otp/request, /auth/otp/verify
// Path B: Keycloak OIDC (office) — redirect handled by Keycloak; /auth/refresh here

import {
  Controller, Post, Body, HttpCode, HttpStatus, Req, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import { OtpService } from './otp/otp.service';
import { IdentityService } from './identity.service';
import { RequestOtpDto, VerifyOtpDto } from './dto/request-otp.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class IdentityController {
  constructor(
    private readonly otpService: OtpService,
    private readonly identityService: IdentityService,
  ) {}

  // ─── Path A: SMS OTP ───────────────────────────────────────────────────

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request SMS OTP for field worker login (Path A)' })
  @ApiResponse({ status: 200, description: 'OTP sent to phone number' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async requestOtp(@Body() dto: RequestOtpDto) {
    return this.otpService.requestOtp(dto.phoneNumber);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and receive JWT tokens (Path A)' })
  @ApiResponse({ status: 200, description: 'Returns access_token and refresh_token' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    await this.otpService.verifyOtp(dto.phoneNumber, dto.otp);
    return this.identityService.issueTokensForPhone(dto.phoneNumber);
  }

  // ─── Path B: Keycloak OIDC ─────────────────────────────────────────────
  // Note: login/callback is handled by Keycloak — clients use Keycloak's
  //       authorization endpoint directly. This endpoint handles token refresh.

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh JWT access token using refresh token' })
  @ApiResponse({ status: 200, description: 'Returns new access_token' })
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.identityService.refreshAccessToken(refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Logout — invalidate refresh token' })
  async logout(@Req() req: Request, @Body('refreshToken') refreshToken: string) {
    await this.identityService.logout(refreshToken);
  }
}
