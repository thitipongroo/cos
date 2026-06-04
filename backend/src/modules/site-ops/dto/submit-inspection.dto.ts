import { IsString, IsOptional, IsEnum, IsUUID, IsDateString, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
}
