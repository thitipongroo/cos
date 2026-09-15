import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EFFECTIVE_PERIOD_RE } from '../central-price-rows';
import { PAGE_DEFAULT, PAGE_MAX } from '../central-price-queries';

// Query strings arrive as strings and the global ValidationPipe runs with implicit conversion OFF
// (main.ts), so `limit` is converted here — and only a string of digits is. Anything else stays a string
// and fails @IsInt with a 400 rather than becoming NaN.
const toInt = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Search text + keyset paging, shared by the admin register and the tenant lookup. */
export class CentralPricePageQueryDto {
  @ApiPropertyOptional({
    description:
      'Case-insensitive substring of code or description. Matched literally: % and _ are not wildcards.',
    maxLength: 200,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ description: 'Opaque — the previous response`s next_cursor.' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: PAGE_MAX, default: PAGE_DEFAULT })
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(PAGE_MAX)
  limit?: number;
}

/** `GET /api/v1/admin/central-prices` */
export class ListCentralPricesQueryDto extends CentralPricePageQueryDto {
  @ApiPropertyOptional({ description: 'Exact category (หมวดหมู่งาน).', maxLength: 255 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  category?: string;

  @ApiPropertyOptional({ description: 'Exact effective_period, e.g. 2569.', example: '2569' })
  @IsOptional()
  @Transform(trim)
  @Matches(EFFECTIVE_PERIOD_RE, { message: 'effective_period is not a valid period' })
  effective_period?: string;
}

/** `GET /api/v1/central-prices` (tenant read) */
export class SearchCentralPricesQueryDto extends CentralPricePageQueryDto {
  @ApiPropertyOptional({ description: 'Exact item code.', maxLength: 100, example: 'STR-001' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  code?: string;
}
