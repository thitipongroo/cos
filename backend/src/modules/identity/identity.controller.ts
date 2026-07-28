// Auth controller — Phase 2
// Path A: SMS OTP (field workers) — POST /auth/otp/request, /auth/otp/verify
// Path B: Keycloak OIDC (office) — redirect handled by Keycloak; /auth/refresh here
// MFA (TOTP) — required for TENANT_ADMIN and FINANCE (Path B users only)

import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ROLE_PERMISSIONS } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { OtpService } from './otp/otp.service';
import { IdentityService } from './identity.service';
import { MfaService } from './mfa/mfa.service';
import { DeviceTrustService } from './device-trust/device-trust.service';
import { FeatureFlag } from '../../shared/feature-flags/feature-flag.decorator';
import {
  RequestOtpDto,
  VerifyOtpDto,
  AttestDeviceDto,
  RegisterDeviceDto,
} from './dto/request-otp.dto';
import { RefreshTokenDto, MfaTokenDto } from './dto/token.dto';
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
    private readonly deviceTrust: DeviceTrustService,
  ) {}

  // ─── Path A: SMS OTP ───────────────────────────────────────────────────

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @FeatureFlag('s1.identity.sms-otp-login') // QM-15 retrofit kill-switch (ADR-049)
  @ApiOperation({ summary: 'Request SMS OTP for field worker login (Path A)' })
  @ApiResponse({ status: 200, description: 'OTP sent to phone number' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async requestOtp(@Body() dto: RequestOtpDto) {
    const result = await this.otpService.requestOtp(dto.phoneNumber);
    // Device trust (§20.6.1): when the client sends a deviceId, mint a single-use challenge it signs
    // with its hardware key. Absent a deviceId the response is unchanged.
    if (dto.deviceId) {
      const challenge = await this.deviceTrust.issueChallenge(dto.phoneNumber, dto.deviceId);
      return { ...result, challenge };
    }
    return result;
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @FeatureFlag('s1.identity.sms-otp-login') // QM-15 retrofit kill-switch (ADR-049)
  @ApiOperation({ summary: 'Verify OTP and receive JWT tokens (Path A)' })
  @ApiResponse({ status: 200, description: 'Returns access_token and refresh_token' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    await this.otpService.verifyOtp(dto.phoneNumber, dto.otp);
    return this.identityService.issueTokensForPhone(dto.phoneNumber);
  }

  @Post('otp/attest')
  @HttpCode(HttpStatus.OK)
  @FeatureFlag('s1.identity.sms-otp-login')
  @ApiOperation({ summary: 'Attest device trust before OTP (§20.6.1) — powers the trust banner' })
  @ApiResponse({
    status: 200,
    description: 'Returns { deviceTrusted } for the OTP screen indicator',
  })
  async attestDevice(@Body() dto: AttestDeviceDto) {
    // Verifies the device signed the issued challenge with its registered key. Never blocks login —
    // it only reports trust; a failure (unknown/revoked/expired/bad signature) returns false.
    const deviceTrusted = await this.deviceTrust.evaluateTrust({
      phoneNumber: dto.phoneNumber,
      deviceId: dto.deviceId,
      signature: dto.signature,
    });
    return { deviceTrusted };
  }

  // ─── Device trust (§20.6.1) — enrol / list / revoke a user's devices ───

  @Post('devices')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Enrol this device for trust (register its public key)' })
  @ApiResponse({ status: 204, description: 'Device enrolled (idempotent on user+deviceId)' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  async registerDevice(@Req() req: Request, @Body() dto: RegisterDeviceDto) {
    const user = req.user as JwtPayload;
    await this.deviceTrust.registerDevice({
      userId: user.user_id,
      tenantId: user.tenant_id,
      deviceId: dto.deviceId,
      publicKey: dto.publicKey,
      platform: dto.platform,
      model: dto.model ?? null,
    });
  }

  @Get('devices')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List the authenticated user's trusted devices" })
  @ApiResponse({ status: 200, description: 'Active (non-revoked) trusted devices' })
  async listDevices(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.deviceTrust.listDevices(user.user_id);
  }

  @Delete('devices/:deviceId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a trusted device' })
  @ApiResponse({ status: 204, description: 'Device revoked (idempotent)' })
  async revokeDevice(@Req() req: Request, @Param('deviceId') deviceId: string) {
    const user = req.user as JwtPayload;
    await this.deviceTrust.revokeDevice(user.user_id, deviceId);
  }

  // The authoritative RBAC matrix (spec §6.4) is the single source of truth for what a role may do.
  // Exposing it read-only lets clients (the mobile invite flow's "role permissions" screen) show a
  // real access breakdown instead of a hard-coded one — no tenant/user state, just the static grant set.
  @Get('roles/:role/permissions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List the resource:action permissions granted to a role (RBAC §6.4)' })
  @ApiResponse({ status: 200, description: 'Granted permissions for the role' })
  @ApiResponse({ status: 400, description: 'Unknown role' })
  getRolePermissions(@Param('role') role: string): { role: CosRole; permissions: string[] } {
    if (!Object.values(CosRole).includes(role as CosRole)) {
      throw new BadRequestException(`Unknown role: ${role}`);
    }
    return { role: role as CosRole, permissions: ROLE_PERMISSIONS[role as CosRole] };
  }

  // ─── Path B: Keycloak OIDC ─────────────────────────────────────────────
  // Note: login/callback is handled by Keycloak — clients use Keycloak's
  //       authorization endpoint directly. This endpoint handles token refresh.

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh JWT access token using refresh token' })
  @ApiResponse({ status: 200, description: 'Returns new access_token' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.identityService.refreshAccessToken(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Logout — invalidate refresh token' })
  async logout(@Body() dto: RefreshTokenDto) {
    await this.identityService.logout(dto.refreshToken);
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
  async mfaVerify(@Req() req: Request, @Body() dto: MfaTokenDto) {
    const user = req.user as JwtPayload;
    await this.mfaService.verifyAndActivate(user.user_id, dto.token);
  }

  @Post('mfa/authenticate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Verify TOTP token during login (Path B only)' })
  @ApiResponse({ status: 204, description: 'TOTP verified' })
  @ApiResponse({ status: 400, description: 'MFA not enrolled for this user' })
  @ApiResponse({ status: 401, description: 'Invalid TOTP token' })
  async mfaAuthenticate(@Req() req: Request, @Body() dto: MfaTokenDto) {
    const user = req.user as JwtPayload;
    await this.mfaService.authenticate(user.user_id, dto.token);
  }
}
