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

/**
 * What KIND of issue this is — site_ops.issues.issue_type (master §Phase 6; the column and its CHECK
 * constraint have existed since migration 20260619000002_tasks_permits, where it classifies the
 * issues that block task completion: gate #2 blocks on an OPEN issue of type DEFECT/REWORK/PUNCH).
 *
 * The column was write-only from the API's point of view until now — no DTO carried it, so every
 * issue created through `POST /site/issues` took the DB default GENERAL and the task-completion gate
 * could never see a blocking one it did not get from a direct SQL insert. Exposing the real four
 * values (product-owner decision 2026-08-08) is what lets the field app classify an issue at source.
 */
export enum IssueType {
  DEFECT = 'DEFECT',
  REWORK = 'REWORK',
  PUNCH = 'PUNCH',
  GENERAL = 'GENERAL',
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

  // Optional so every existing caller keeps working unchanged: omitted → the column's own DEFAULT
  // 'GENERAL' applies, which is exactly what those callers got before this field existed.
  @ApiPropertyOptional({ enum: IssueType, default: IssueType.GENERAL })
  @IsOptional()
  @IsEnum(IssueType)
  issue_type?: IssueType;

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
