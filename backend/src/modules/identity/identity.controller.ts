// Auth controller — Phase 2
// Path A: SMS OTP (field workers) — POST /auth/otp/request, /auth/otp/verify
// Path B: Keycloak OIDC (office) — redirect handled by Keycloak; /auth/refresh here
// MFA (TOTP) — required for TENANT_ADMIN and FINANCE (Path B users only)

import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { OtpService } from './otp/otp.service';
import { IdentityService } from './identity.service';
import { MfaService } from './mfa/mfa.service';
import { RequestOtpDto, VerifyOtpDto } from './dto/request-otp.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { JwtPayload } from './jwt.payload';

// Auth endpoints: 10 req/min per IP — brute force protection (spec §5.5, QM-7)
@Throttle({ default: { limit: 10, ttl: 60000 } })
@ApiTags('auth')
@Controller('auth')
export class IdentityController {
  constructor(
    private readonly otpService: OtpService,
    private readonly identityService: IdentityService,
    private readonly mfaService: MfaService,
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
  async logout(@Body('refreshToken') refreshToken: string) {
    await this.identityService.logout(refreshToken);
  }

  // ─── MFA (TOTP) — TENANT_ADMIN and FINANCE only ──────────────────────

  @Post('mfa/enroll')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Initiate TOTP MFA enrollment — returns otpauth:// URI for QR code (Path B office users)',
  })
  @ApiResponse({ status: 200, description: 'OTP auth URL and secret for QR code rendering' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  async mfaEnroll(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.mfaService.generateEnrollmentSecret(user.user_id, user.sub);
  }

  @Post('mfa/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Confirm TOTP token to complete MFA enrollment' })
  @ApiResponse({ status: 204, description: 'MFA enrollment confirmed — mfa_enabled set to true' })
  @ApiResponse({ status: 400, description: 'No pending enrollment or enrollment expired' })
  @ApiResponse({ status: 401, description: 'Invalid TOTP token' })
  async mfaVerify(@Req() req: Request, @Body('token') token: string) {
    const user = req.user as JwtPayload;
    await this.mfaService.verifyAndActivate(user.user_id, token);
  }

  @Post('mfa/authenticate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Verify TOTP token during login (Path B only)' })
  @ApiResponse({ status: 204, description: 'TOTP verified' })
  @ApiResponse({ status: 400, description: 'MFA not enrolled for this user' })
  @ApiResponse({ status: 401, description: 'Invalid TOTP token' })
  async mfaAuthenticate(@Req() req: Request, @Body('token') token: string) {
    const user = req.user as JwtPayload;
    await this.mfaService.authenticate(user.user_id, token);
  }
}
