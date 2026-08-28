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
  NotFoundException,
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
import { TrustScoreService } from './device-trust/trust-score/trust-score.service';
import { FeatureFlag } from '../../shared/feature-flags/feature-flag.decorator';
import {
  RequestOtpDto,
  VerifyOtpDto,
  AttestDeviceDto,
  RegisterDeviceDto,
  RevokeDeviceDto,
  AttestationChallengeDto,
} from './dto/request-otp.dto';
import { RefreshTokenDto, MfaTokenDto } from './dto/token.dto';
import { RequestStepUpDto, VerifyStepUpDto } from './dto/step-up.dto';
import { StepUpService } from './step-up/step-up.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import type { JwtPayload } from '../../shared/context/jwt-payload';

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
    private readonly trustScore: TrustScoreService,
    private readonly stepUp: StepUpService,
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
      // Attestation (ADR-082/083). Absent for a client that cannot produce a token; the service then
      // leaves the columns untouched rather than recording a verdict nobody established. The
      // challenge travels with the token — a token alone would be replayable.
      attestationToken: dto.attestationToken ?? null,
      attestationChallenge: dto.attestationChallenge ?? null,
      attestationKeyId: dto.attestationKeyId ?? null,
    });
  }

  @Post('devices/attestation-challenge')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mint a single-use challenge for platform attestation',
    description:
      'Both Play Integrity and App Attest are challenge-response (ADR-083), so the client fetches a ' +
      'nonce, feeds it to the platform API, and returns it alongside the resulting token in ' +
      'POST /auth/devices. A token that is not bound to a nonce this server issued is replayable ' +
      'indefinitely, so the challenge is consumed on use and a mismatch simply records no ' +
      'attestation — enrolment still succeeds, because attestation never blocks (ADR-054).',
  })
  @ApiResponse({ status: 200, description: 'A single-use, short-lived challenge' })
  async attestationChallenge(@Req() req: Request, @Body() dto: AttestationChallengeDto) {
    const user = req.user as JwtPayload;
    const challenge = await this.deviceTrust.issueAttestationChallenge(user.user_id, dto.deviceId);
    return { challenge };
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

  @Get('devices/:deviceId/trust')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @FeatureFlag('s1.identity.device-trust-score')
  @ApiOperation({
    summary: 'The trust score for one of the caller’s own devices (ADR-081)',
    description:
      'ADVISORY ONLY. It never revokes a device and never blocks a login — §22.3 bars a model from ' +
      'executing a transition that requires a human, and ADR-081 keeps the property while the ' +
      'scorer is rules so that a regression here cannot become a lockout. ' +
      '`scoredBy` says which scorer produced the number: it reads RULES until a DeviceTrustModel ' +
      'beats this baseline on PR-AUC, and the screen must not describe the score as AI-derived ' +
      'while it does. Every signal is returned with the points it earned out of the points ' +
      'available, so a low score is actionable instead of oracular, and `capped` says when a single ' +
      'finding held the total down rather than the signals simply summing low.',
  })
  @ApiResponse({ status: 200, description: 'Score 0–100 with its per-signal derivation' })
  @ApiResponse({ status: 404, description: 'No such active enrolment for this user' })
  @ApiResponse({ status: 503, description: 'Feature flag off (COS-FLAG-001)' })
  async deviceTrustScore(@Req() req: Request, @Param('deviceId') deviceId: string) {
    const user = req.user as JwtPayload;
    const report = await this.trustScore.report({
      tenantId: user.tenant_id,
      userId: user.user_id,
      deviceId,
    });
    // Scoped by user_id AND device_id, so an unknown id and someone else's id are the same answer.
    // A 404 that distinguished them would confirm the existence of another person's enrolment.
    if (!report) throw new NotFoundException('device not found');
    return report;
  }

  @Delete('devices/:deviceId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Revoke a trusted device',
    description:
      'The reason is required (ADR-081): COMPROMISED is the only value treated as a positive ' +
      'training label for DeviceTrustModel, and defaulting it would either mark ordinary churn as ' +
      'an attack or bury real compromises among retired handsets. A DELETE carrying a body is ' +
      'unusual but permitted, and the alternative — a reason in the query string — would put a ' +
      'security finding in every access log and proxy trace.',
  })
  @ApiResponse({ status: 204, description: 'Device revoked (idempotent)' })
  @ApiResponse({ status: 400, description: 'Missing or unknown revocation reason' })
  async revokeDevice(
    @Req() req: Request,
    @Param('deviceId') deviceId: string,
    @Body() dto: RevokeDeviceDto,
  ) {
    const user = req.user as JwtPayload;
    await this.deviceTrust.revokeDevice(user.user_id, deviceId, dto.reason);
  }

  // ─── Step-up verification (ADR-078) — re-prove possession before a high-value action ───
  //
  // Under @Controller('auth') on purpose: this is an auth primitive, and it therefore inherits this
  // class's @Throttle({ limit: 10, ttl: 60000 }) — exactly QM-7's auth tier — instead of restating
  // it. The endpoints are behind JwtAuthGuard: a step-up CONFIRMS an already-authenticated caller,
  // it never authenticates one.

  @Post('step-up/request')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Send a step-up verification code for a high-value action',
    description:
      "Delivers a 6-digit code to the account's registered channel — SMS when the account has a " +
      'phone number, otherwise email (every account has an email; only Path A accounts have a ' +
      'phone). Returns the channel and a MASKED destination; the full address is never echoed back.',
  })
  @ApiResponse({ status: 201, description: 'Code sent' })
  @ApiResponse({ status: 429, description: 'Daily verification limit exceeded' })
  async requestStepUp(@Req() req: Request, @Body() dto: RequestStepUpDto) {
    const user = req.user as JwtPayload;
    return this.stepUp.request(user.user_id, dto.action);
  }

  @Post('step-up/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Exchange a step-up code for a single-use action token',
    description:
      'The action token is NOT a session and can never be exchanged for one. It is bound to this ' +
      'user and this action, lives 5 minutes, and is consumed the first time it is presented.',
  })
  @ApiResponse({ status: 201, description: 'Action token issued' })
  @ApiResponse({ status: 400, description: 'Invalid or expired code' })
  @ApiResponse({ status: 429, description: 'Maximum verification attempts exceeded' })
  async verifyStepUp(@Req() req: Request, @Body() dto: VerifyStepUpDto) {
    const user = req.user as JwtPayload;
    const actionToken = await this.stepUp.verify(user.user_id, dto.action, dto.code);
    return { actionToken };
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
