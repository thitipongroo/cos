import { IsString, IsInt, Min, IsOptional, MaxLength, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Project Phase status — a construction execution stage (ADR-070).
// Mirrors the CHECK on projects.project_phases.status.
export enum PhaseStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

// Project Phase — §11 (Project Phases), ADR-070. Created under a project.
// `name` is free-form (no fixed taxonomy — matches BIM IfcBuildingStorey names).
export class CreatePhaseDto {
  @ApiProperty({
    example: 1,
    description: 'Ordering / current-phase derivation key (unique per project)',
  })
  @IsInt()
  @Min(1)
  seq!: number;

  @ApiProperty({ maxLength: 255, example: 'Structural' })
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ enum: PhaseStatus, default: PhaseStatus.NOT_STARTED })
  @IsOptional()
  @IsEnum(PhaseStatus)
  status?: PhaseStatus;

  @ApiPropertyOptional({ example: '2026-03-01' })
  @IsOptional()
  @IsDateString()
  planned_start?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsOptional()
  @IsDateString()
  planned_end?: string;

  @ApiPropertyOptional({ example: '2026-03-05' })
  @IsOptional()
  @IsDateString()
  actual_start?: string;

  @ApiPropertyOptional({ example: '2026-06-28' })
  @IsOptional()
  @IsDateString()
  actual_end?: string;
}
