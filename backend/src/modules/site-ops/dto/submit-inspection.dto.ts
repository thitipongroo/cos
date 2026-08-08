import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  IsNumber,
  IsArray,
  ArrayMaxSize,
  ValidateNested,
  MaxLength,
  Min,
  Max,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IssueSeverity } from './create-issue.dto';

export enum InspectionStatus {
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  REQUIRES_REINSPECTION = 'REQUIRES_REINSPECTION',
}

/**
 * One stroke of a drawn signature — the ADR-056 photo-annotation shape, reused rather than reinvented.
 *
 * `d` is an SVG path in NORMALISED (0..1) coordinates, so the mark re-renders at any pad size or
 * screen density. See migration 20260808000002 for why strokes rather than a rasterised image, and
 * for the limits of what this signature means (an attestation mark, not a qualified e-signature —
 * contract signing is ADR-058's PKI/VC path and is a different mechanism).
 */
export class SignatureStrokeDto {
  @ApiProperty({ description: 'SVG path, normalised 0..1', example: 'M0.1,0.5 L0.4,0.3' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  d!: string;

  @ApiProperty({ example: '#F8FAFC' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  color!: string;

  @ApiProperty({ description: 'Fraction of the canvas long edge', minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  width!: number;
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

  /**
   * The confirming signature (migration 20260808000002). Capped at 200 strokes: a signature is a
   * handful of pen-downs, and an unbounded array on an offline-sync payload is a memory and
   * bandwidth hazard on the §17.7 batch. Absent → NULL, meaning "not signed".
   */
  @ApiPropertyOptional({ type: [SignatureStrokeDto], maxItems: 200 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SignatureStrokeDto)
  signature?: SignatureStrokeDto[];

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
