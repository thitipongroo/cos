import { IsString, IsInt, Min, IsOptional, MaxLength, IsEnum, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PhaseStatus } from './create-phase.dto';

// All fields optional — partial update (COALESCE keeps unspecified columns unchanged).
// The common write is a status/seq advance (e.g. NOT_STARTED → IN_PROGRESS → COMPLETED).
export class UpdatePhaseDto {
  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  seq?: number;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ enum: PhaseStatus })
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
