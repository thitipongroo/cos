import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsObject,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
// The §6.7 justification rules are the ones every SYSTEM_ADMIN action already carries — trimmed, 10-500
// characters — reused rather than restated so the two can never drift apart.
import { AdminJustificationDto } from '../../tenant/public/admin-justification.dto';
import { BROADCAST_CHANNELS, type BroadcastChannel } from '../platform-settings.types';

/**
 * INPUT BOUNDS, NOT DEFAULTS. Each is the largest value the API accepts, set wide enough that no real
 * configuration meets it and narrow enough that a typo (an extra three zeros) is refused. None of them is
 * a recommended setting, and none is enforced anywhere — the values are stored only (ADR-108).
 */
export const PLATFORM_SETTINGS_BOUNDS = {
  /** Names, protocol, cadence, window, mode, DB strategy. */
  TEXT_MAX: 200,
  /** Gateway URLs. */
  URL_MAX: 2048,
  MAX_RETRIES: 100,
  /** One year. */
  HOURS_MAX: 8760,
  SHARED_TENANT_CAP_MAX: 1_000_000,
  POOL_CONNS_MAX: 10_000,
  /** One exabyte, in GB. */
  STORAGE_QUOTA_GB_MAX: 1_000_000_000,
  /** Largest integer a JSON number carries exactly. */
  MONTHLY_QUOTA_MAX: Number.MAX_SAFE_INTEGER,
} as const;

const B = PLATFORM_SETTINGS_BOUNDS;

// null is "not set" and skips the remaining checks; ABSENT is not null, so a missing key is still
// validated and refused. A PUT replaces the whole document, and a partial one would erase what it omits.
const nullable = () => ValidateIf((_o: object, value: unknown) => value !== null);

// Blank or whitespace-only text is "not set": trimmed, and stored as null, so "not set" has one encoding.
const blankToNull = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() || null : value;

const NullableText = (max: number = B.TEXT_MAX) =>
  applyDecorators(
    ApiProperty({ type: String, nullable: true, maxLength: max }),
    Transform(blankToNull),
    nullable(),
    IsString(),
    MaxLength(max),
  );

const NullableCount = (max: number) =>
  applyDecorators(
    ApiProperty({ type: Number, nullable: true, minimum: 0, maximum: max }),
    nullable(),
    IsInt(),
    Min(0),
    Max(max),
  );

const NullableFlag = () =>
  applyDecorators(ApiProperty({ type: Boolean, nullable: true }), nullable(), IsBoolean());

// https only: a gateway reached over plain http would carry its credentials and payload in the clear.
// require_tld is off so an internal hostname is accepted; the scheme is not negotiable. No userinfo
// (`https://user:secret@host`): the whole document is copied into platform.audit_logs, which nothing can
// edit or purge, so a credential typed into a URL would be kept forever (Rule 41 review, 2026-09-15).
const NullableHttpsUrl = () =>
  applyDecorators(
    ApiProperty({
      type: String,
      nullable: true,
      maxLength: B.URL_MAX,
      example: 'https://gw.example.com',
    }),
    nullable(),
    IsString(),
    MaxLength(B.URL_MAX),
    IsUrl({
      protocols: ['https'],
      require_protocol: true,
      require_tld: false,
      disallow_auth: true,
    }),
  );

// A nested section is required and must be an object; its own class is validated, and — under the global
// whitelist + forbidNonWhitelisted pipe — an unknown key inside it is refused like one at the top.
const Section = (cls: () => new () => object) =>
  applyDecorators(ApiProperty({ type: cls }), IsDefined(), IsObject(), ValidateNested(), Type(cls));

export class PrimaryGatewayDto {
  @NullableText() name!: string | null;
  @NullableHttpsUrl() url!: string | null;
  @NullableText() protocol!: string | null;
}

export class SecondaryGatewayDto {
  @NullableText() name!: string | null;
  @NullableHttpsUrl() url!: string | null;
  @NullableCount(B.MAX_RETRIES) max_retries!: number | null;
}

export class GatewaysDto {
  @Section(() => PrimaryGatewayDto) primary!: PrimaryGatewayDto;
  @Section(() => SecondaryGatewayDto) secondary!: SecondaryGatewayDto;
  @NullableText() auto_sync_cadence!: string | null;
  @NullableCount(B.HOURS_MAX) failover_cache_ttl_hours!: number | null;
  @NullableFlag() auto_fallback_on_timeout!: boolean | null;
}

export class MaintenanceDto {
  @NullableFlag() safety_non_suspension!: boolean | null;
  @NullableText() shared_tiers_window!: string | null;
  @NullableText() enterprise_mode!: string | null;
}

export class BroadcastDto {
  @NullableCount(B.HOURS_MAX) lead_time_hours!: number | null;

  @ApiProperty({ enum: BROADCAST_CHANNELS, isArray: true })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(BROADCAST_CHANNELS.length)
  @IsIn(BROADCAST_CHANNELS, { each: true })
  channels!: BroadcastChannel[];
}

export class LimitsDto {
  @NullableCount(B.SHARED_TENANT_CAP_MAX) shared_tenant_cap!: number | null;
  @NullableCount(B.POOL_CONNS_MAX) default_max_pool_conns!: number | null;
}

export class TierLimitsDto {
  @NullableText() db_strategy!: string | null;
  @NullableCount(B.STORAGE_QUOTA_GB_MAX) storage_quota_gb!: number | null;
  @NullableCount(B.MONTHLY_QUOTA_MAX) api_monthly_quota!: number | null;
  @NullableCount(B.MONTHLY_QUOTA_MAX) token_limit_monthly!: number | null;
}

export class TiersDto {
  @Section(() => TierLimitsDto) STARTER!: TierLimitsDto;
  @Section(() => TierLimitsDto) PROFESSIONAL!: TierLimitsDto;
  @Section(() => TierLimitsDto) ENTERPRISE!: TierLimitsDto;
}

export class PlatformSettingsDto {
  @Section(() => GatewaysDto) gateways!: GatewaysDto;
  @Section(() => MaintenanceDto) maintenance!: MaintenanceDto;
  @Section(() => BroadcastDto) broadcast!: BroadcastDto;
  @Section(() => LimitsDto) limits!: LimitsDto;
  @Section(() => TiersDto) tiers!: TiersDto;
}

/** `PUT /api/v1/admin/settings` — the whole document, the version it was read at, and the reason. */
export class UpdatePlatformSettingsDto extends AdminJustificationDto {
  @ApiProperty({
    description:
      'The `version` the settings were read at. A stored version that has moved since is a 409.',
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  version!: number;

  @Section(() => PlatformSettingsDto)
  settings!: PlatformSettingsDto;
}
