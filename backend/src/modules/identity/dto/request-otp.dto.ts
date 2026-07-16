import { IsString, IsOptional, IsIn, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
}
