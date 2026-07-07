import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  IsNumber,
  Min,
  Max,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum IssueSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export class CreateIssueDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  project_id!: string;

  // G-M11 — client-generated issue id (offline create). When provided it becomes the server issue_id
  // so offline-attached photos (entity_id = this UUID) link correctly on sync. Falls back to a
  // server UUID when absent (mirrors site_report client_id → report_id).
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Client-generated id for offline idempotency',
  })
  @IsOptional()
  @IsUUID()
  client_id?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Link to a site report' })
  @IsOptional()
  @IsUUID()
  report_id?: string;

  @ApiProperty({ maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: IssueSeverity, default: IssueSeverity.LOW })
  @IsEnum(IssueSeverity)
  severity!: IssueSeverity;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assigned_to?: string;

  @ApiPropertyOptional({ description: 'Device clock timestamp — ISO 8601 UTC' })
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
