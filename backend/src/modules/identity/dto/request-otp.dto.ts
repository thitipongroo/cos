import { IsString, IsOptional, IsIn, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  REVOCATION_REASONS,
  type DeviceRevocationReason,
} from '../device-trust/device-trust.service';

// Device-trust field formats (§20.6.1). All optional: a client that opts out of device trust omits
// them, and OTP login is unchanged. base64url alphabet only, length-capped to bound the payload.
const B64URL = /^[A-Za-z0-9_-]+$/;

export class RequestOtpDto {
  @ApiProperty({ example: '+66812345678', description: 'E.164 format phone number' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, { message: 'phoneNumber must be E.164 format (e.g. +66812345678)' })
  phoneNumber!: string;

  @ApiPropertyOptional({ description: 'Stable per-install device id (device trust, §20.6.1)' })
  @IsOptional()
  @IsString()
  @Matches(B64URL, { message: 'deviceId must be base64url' })
  @MaxLength(128)
  deviceId?: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '+66812345678' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phoneNumber!: string;

  @ApiProperty({ example: '123456', description: '6-digit OTP' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'otp must be a 6-digit number' })
  otp!: string;
}

// Device trust (§20.6.1): the device proves possession of its key BEFORE the OTP step, so the OTP
// screen can show a real trusted/untrusted banner while the user types. Public + throttled — a caller
// without the private key can only ever get deviceTrusted:false, so it is no enrolment oracle.
export class AttestDeviceDto {
  @ApiProperty({ example: '+66812345678' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phoneNumber!: string;

  @ApiProperty({ description: 'Stable per-install device id (same id sent to /auth/otp/request)' })
  @IsString()
  @Matches(B64URL, { message: 'deviceId must be base64url' })
  @MaxLength(128)
  deviceId!: string;

  @ApiProperty({ description: 'Base64url IEEE-P1363 signature over the issued challenge' })
  @IsString()
  @Matches(B64URL, { message: 'signature must be base64url' })
  @MaxLength(200)
  signature!: string;
}

export class RegisterDeviceDto {
  @ApiProperty({ description: 'Stable per-install device id' })
  @IsString()
  @Matches(B64URL, { message: 'deviceId must be base64url' })
  @MaxLength(128)
  deviceId!: string;

  @ApiProperty({ description: 'Base64url SPKI DER P-256 public key' })
  @IsString()
  @Matches(B64URL, { message: 'publicKey must be base64url' })
  @MaxLength(1000)
  publicKey!: string;

  @ApiProperty({ enum: ['ios', 'android'] })
  @IsString()
  @IsIn(['ios', 'android'])
  platform!: string;

  @ApiPropertyOptional({ description: 'Human-readable device model' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  model?: string;

  // ── Platform attestation (ADR-082) ──────────────────────────────────────────
  //
  // All optional. A client with no Play Services, an older build, or an OS the API does not cover
  // still enrols — attestation is additive and never blocks (ADR-054's non-blocking guarantee).

  @ApiPropertyOptional({
    description:
      'Play Integrity / App Attest token from @expo/app-integrity. Verified server-side; a ' +
      'client-reported verdict is a claim, not evidence (ADR-082). Must be sent together with the ' +
      'attestationChallenge it was minted against.',
  })
  @IsOptional()
  @IsString()
  // Play Integrity tokens are long JWS-shaped strings. Bounded so an oversized body cannot be used
  // to push work onto the verifier, and unvalidated beyond that: parsing is the verifier's job, and
  // a format check here would only encode today's platform format into the request layer.
  @MaxLength(8192)
  attestationToken?: string;

  @ApiPropertyOptional({
    description:
      'The server-issued challenge the attestation answers (from POST /auth/otp/request). Both ' +
      'platforms are challenge-response, so a token without its challenge is replayable forever.',
  })
  @IsOptional()
  @IsString()
  @Matches(B64URL, { message: 'attestationChallenge must be base64url' })
  @MaxLength(128)
  attestationChallenge?: string;

  @ApiPropertyOptional({
    description:
      'iOS only: the App Attest key identifier the attestation object vouches for. Apple attests a ' +
      'KEY rather than a request, so the object cannot be interpreted without it. Android sends none.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  attestationKeyId?: string;

  // There is deliberately NO osVersion or securityPatchLevel here. The client does not report device
  // properties: ADR-082 forbids client-side integrity signals, and ADR-083 established that the only
  // server-verifiable OS signal either platform offers arrives INSIDE the attestation token
  // (Play Integrity's deviceAttributes.sdkVersion), not beside it.
}

/** Which device the attestation challenge is being minted for (ADR-083). */
export class AttestationChallengeDto {
  @ApiProperty({ description: 'The per-install device id the attestation will be bound to' })
  @IsString()
  @Matches(B64URL, { message: 'deviceId must be base64url' })
  @MaxLength(128)
  deviceId!: string;
}

/**
 * Why a device is being revoked (ADR-081).
 *
 * Required, not optional. The reason is the ONLY source of the model's positive class, and a default
 * would silently label every revocation identically — most damagingly, it would either mark ordinary
 * churn as a compromise or bury real compromises among lost handsets.
 */
export class RevokeDeviceDto {
  @ApiProperty({
    enum: REVOCATION_REASONS,
    description:
      'USER_REVOKED / ADMIN_REVOKED / LOST_OR_STOLEN are ordinary hygiene. COMPROMISED is a ' +
      'security finding and is the only value treated as a positive training label (ADR-081).',
  })
  @IsIn(REVOCATION_REASONS as unknown as string[])
  reason!: DeviceRevocationReason;
}
