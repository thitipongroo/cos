import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdminJustificationDto } from '../../tenant/public/admin-justification.dto';
import { EFFECTIVE_PERIOD_RE } from '../central-price-rows';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** A form posts an untouched optional input as an empty string; that means "not given". */
const trimToUndefined = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() || undefined : value;

/**
 * The text fields of `POST /api/v1/admin/central-prices/import` (multipart/form-data, beside `file`).
 *
 * Not bound by the global ValidationPipe — a multipart body is read part by part in the controller — so
 * CentralPricesAdminController validates an instance of this class with class-validator explicitly, with
 * the same whitelist / forbidNonWhitelisted options (QM-4). `justification` carries exactly the rules of
 * every other SYSTEM_ADMIN action, by inheritance rather than by copy (§6.7).
 */
export class ImportCentralPricesDto extends AdminJustificationDto {
  @ApiProperty({
    description:
      'The catalog version every row of the file belongs to (ADR-061 "year/version"). Write periods so ' +
      'that text order is time order — 2568 before 2569, 2569-01 before 2569-02 — because the latest ' +
      'period of a code is the one BOQ lines are linked to.',
    example: '2569',
    pattern: EFFECTIVE_PERIOD_RE.source,
  })
  @Transform(trim)
  @IsString()
  @Matches(EFFECTIVE_PERIOD_RE, {
    message:
      'effective_period must be 1-32 letters, digits, ".", "_", "/" or "-", starting with a letter or digit',
  })
  effective_period!: string;

  @ApiPropertyOptional({
    description: 'Where the prices were published — the circular or announcement reference.',
    maxLength: 500,
    example: 'กค 0433.2/ว 123 (2569-03-01)',
  })
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(500)
  source_ref?: string;
}
