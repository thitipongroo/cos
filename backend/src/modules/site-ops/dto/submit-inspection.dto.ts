import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  IsNumber,
  Min,
  Max,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IssueSeverity } from './create-issue.dto';

export enum InspectionStatus {
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  REQUIRES_REINSPECTION = 'REQUIRES_REINSPECTION',
}

export class SubmitInspectionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  project_id!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  checklist_id!: string;

  @ApiProperty({ enum: InspectionStatus })
  @IsEnum(InspectionStatus)
  status!: InspectionStatus;

  @ApiProperty({ description: 'ISO 8601 UTC timestamp of when inspection occurred' })
  @IsDateString()
  @IsNotEmpty()
  inspected_at!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  // spec 11 §517: populated when the inspection result is FAILED (or conditional). Nullable/optional.
  @ApiPropertyOptional({ enum: IssueSeverity })
  @IsOptional()
  @IsEnum(IssueSeverity)
  issue_severity?: IssueSeverity;

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
