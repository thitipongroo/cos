import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional, IntersectionType, PickType } from '@nestjs/swagger';

/** Page size of the SYSTEM_ADMIN audit-log reads (product-owner decision D3, 2026-09-15). */
export const AUDIT_PAGE_DEFAULT = 50;
export const AUDIT_PAGE_MAX = 100;

// Query strings arrive as strings and the global ValidationPipe runs with implicit conversion OFF
// (main.ts), so a numeric parameter is converted here — and ONLY a string of digits is. Anything else
// stays a string and fails @IsInt with a 400, rather than being coerced into NaN or a truncated number.
const toInt = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;

// PostgreSQL refuses U+0000 in a text parameter ("invalid byte sequence for encoding UTF8"), which would surface as a
// 500 from inside the read. Refused here as a 400 instead (Rule 41 review, 2026-09-15).
const NO_NUL = /^[^\u0000]*$/;

// A date, or a date-time WITH its offset. `IsISO8601({ strict: true })` alone also admits a date-time with no offset
// (which JavaScript reads in the server's local zone, so the window would depend on the pod's TZ), signed years
// (which V8 misreads) and fractions finer than a millisecond (which Date silently truncates).
const INSTANT = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/;
const INSTANT_MESSAGE =
  '$property must be a date (YYYY-MM-DD) or a date-time with Z or an offset, to the millisecond';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** `q` — the free-text search both audit reads accept. */
export class AuditLogSearchDto {
  @ApiPropertyOptional({
    description:
      'Case-insensitive substring over the action, the actor email and metadata.justification. ' +
      'Matched literally: % and _ are not wildcards. Trimmed; empty means no search.',
    maxLength: 200,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  @Matches(NO_NUL, { message: '$property must not contain a NUL character' })
  q?: string;
}

/** Keyset paging: the opaque cursor from the previous page's `next_cursor`, and a page size. */
export class AuditLogPageDto extends AuditLogSearchDto {
  @ApiPropertyOptional({ description: 'Opaque — the previous response`s next_cursor.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: AUDIT_PAGE_MAX, default: AUDIT_PAGE_DEFAULT })
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(AUDIT_PAGE_MAX)
  limit?: number;
}

/** The cross-tenant filters (R17.6). Every one is optional; they combine with AND. */
export class AuditLogFilterDto extends AuditLogSearchDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Rows whose audit_logs.tenant_id is this tenant — the tenant the action was recorded AGAINST ' +
      '(for tenant.* actions the target tenant, not the operator`s home tenant).',
  })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Rows whose actor_id is this user.' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({
    description:
      'Exact action (`tenant.deactivate`), or a prefix when the value ends with a dot (`tenant.`).',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(NO_NUL, { message: '$property must not contain a NUL character' })
  action?: string;

  @ApiPropertyOptional({
    description:
      'ISO 8601 date (00:00 UTC) or date-time with Z or an offset, to the millisecond; inclusive (occurred_at >= from).',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(INSTANT, { message: INSTANT_MESSAGE })
  from?: string;

  @ApiPropertyOptional({
    description:
      'ISO 8601 date (00:00 UTC) or date-time with Z or an offset, to the millisecond; exclusive (occurred_at < to).',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(INSTANT, { message: INSTANT_MESSAGE })
  to?: string;
}

/** `GET /admin/audit-logs` — filters plus paging. */
export class AuditLogListDto extends IntersectionType(AuditLogFilterDto, AuditLogPageDto) {}

/** `GET /admin/audit-logs/summary` — only the window applies. */
export class AuditLogSummaryDto extends PickType(AuditLogFilterDto, ['from', 'to'] as const) {}

export const AUDIT_EXPORT_FORMATS = ['csv', 'json'] as const;
export type AuditExportFormat = (typeof AUDIT_EXPORT_FORMATS)[number];

/** `GET /admin/audit-logs/export` — filters plus the file format. */
export class AuditLogExportDto extends AuditLogFilterDto {
  @ApiPropertyOptional({ enum: AUDIT_EXPORT_FORMATS, default: 'csv' })
  @IsOptional()
  @IsIn(AUDIT_EXPORT_FORMATS)
  format?: AuditExportFormat;
}
