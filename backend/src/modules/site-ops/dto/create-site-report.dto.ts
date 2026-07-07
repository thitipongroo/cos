import {
  IsString,
  IsOptional,
  IsDateString,
  IsInt,
  IsNumber,
  Min,
  Max,
  MaxLength,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
