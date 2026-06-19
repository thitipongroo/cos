// Inspection approval / re-inspection (ADR-025). Status transition on an existing inspection.
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum InspectionTargetStatus {
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  REQUIRES_REINSPECTION = 'REQUIRES_REINSPECTION',
}

export class UpdateInspectionDto {
  @ApiProperty({
    enum: InspectionTargetStatus,
    description: 'New status — PASSED (approve), FAILED, or REQUIRES_REINSPECTION',
  })
  @IsEnum(InspectionTargetStatus)
  status!: InspectionTargetStatus;

  @ApiPropertyOptional({ description: 'Reviewer notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
