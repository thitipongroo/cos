import {
  IsString,
  IsOptional,
  IsDateString,
  IsInt,
  IsNumber,
  IsEnum,
  IsArray,
  ValidateNested,
  ArrayMaxSize,
  IsNotEmpty,
  Min,
  Max,
  MaxLength,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Which shift the report covers — site_ops.site_reports.shift (migration 20260808000001). */
export enum ReportShift {
  DAY = 'DAY',
  NIGHT = 'NIGHT',
}

/**
 * Classification of the free-text `blockers` description — site_ops.site_reports.blocker_category
 * (migration 20260808000001). The text stays the record; this is the queryable axis over it.
 */
export enum BlockerCategory {
  WEATHER = 'WEATHER',
  MATERIAL = 'MATERIAL',
  POWER = 'POWER',
  OTHER = 'OTHER',
}

/**
 * One trade's headcount on a daily report → one site_ops.manpower_logs row (master §Phase 6).
 *
 * The table has existed since the Phase 6 migration but no API ever wrote to it, so `manpower_count`
 * was the only headcount the platform could store — a single number with no breakdown. The Site
 * Worker report mockup draws the breakdown (electricians / structural, each with its own count), and
 * that is what these lines persist.
 */
export class ManpowerLineDto {
  @ApiProperty({ maxLength: 100, example: 'ELECTRICAL' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  trade_type!: string;

  @ApiProperty({ minimum: 0, example: 8 })
  @IsInt()
  @Min(0)
  worker_count!: number;

  // NOT NULL on the table with no default, so a caller that omits it gets the standard shift length
  // applied by the service rather than a failed insert. Kept optional here because the mockup's form
  // collects headcount per trade and no hours field at all.
  @ApiPropertyOptional({ minimum: 0, maximum: 24, description: 'Hours worked; defaults to 8' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(24)
  hours_worked?: number;
}

export class CreateSiteReportDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  project_id!: string;

  @ApiProperty({ example: '2026-06-04', description: 'YYYY-MM-DD' })
  @IsDateString()
  report_date!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  // spec 11 §474 Site Reports — free-text obstacles on the daily report (§20.7.6 "manpower, blockers").
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  blockers?: string;

  // Classifies `blockers` above (migration 20260808000001). Independent of it on purpose: a report
  // may carry a category with no description, or a description the operator did not classify.
  @ApiPropertyOptional({ enum: BlockerCategory })
  @IsOptional()
  @IsEnum(BlockerCategory)
  blocker_category?: BlockerCategory;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  weather?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  manpower_count?: number;

  // Which shift the report covers (migration 20260808000001). Omitted → NULL, meaning "not
  // recorded"; it is never defaulted to DAY, which would assert a fact nobody entered.
  @ApiPropertyOptional({ enum: ReportShift })
  @IsOptional()
  @IsEnum(ReportShift)
  shift?: ReportShift;

  // Per-trade breakdown → site_ops.manpower_logs. Capped so one request cannot open an unbounded
  // number of inserts; 20 trades on a single daily report is already far beyond any real site.
  @ApiPropertyOptional({ type: [ManpowerLineDto], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ManpowerLineDto)
  manpower_lines?: ManpowerLineDto[];

  @ApiPropertyOptional({
    description: 'Device clock timestamp — ISO 8601 UTC',
    example: '2026-06-04T08:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  client_submitted_at?: string;

  @ApiPropertyOptional({ minimum: -90, maximum: 90, description: 'GPS latitude (geo-tag)' })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ minimum: -180, maximum: 180, description: 'GPS longitude (geo-tag)' })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}
