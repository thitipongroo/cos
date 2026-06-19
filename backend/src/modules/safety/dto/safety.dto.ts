// DTOs for the Safety module (§11 Incidents / Permit, §14, §15.5 permit approval).

import { IsString, IsNotEmpty, IsUUID, IsOptional, IsIn, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const PERMIT_TYPES = ['WORK_PERMIT', 'SAFETY_PERMIT', 'DRAWING_APPROVAL', 'ENTRY_PERMIT'] as const;
const APPROVAL_TIERS = ['SAFETY_OFFICER', 'PROJECT_MANAGER', 'TENANT_ADMIN'] as const;

export class CreateIncidentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  project_id!: string;

  @ApiProperty({ description: 'Incident classification (free-form)' })
  @IsString()
  @IsNotEmpty()
  incident_type!: string;

  @ApiProperty({ enum: SEVERITIES })
  @IsIn(SEVERITIES)
  severity!: (typeof SEVERITIES)[number];

  @ApiPropertyOptional({ description: 'Linked task (completion gate #5)', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  task_id?: string;
}

export class CreatePermitDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  project_id!: string;

  @ApiProperty({ enum: PERMIT_TYPES })
  @IsIn(PERMIT_TYPES)
  permit_type!: (typeof PERMIT_TYPES)[number];

  @ApiProperty({ description: 'Permit number' })
  @IsString()
  @IsNotEmpty()
  permit_number!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  linked_task_id?: string;

  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @IsDateString()
  valid_from?: string;

  @ApiPropertyOptional({ example: '2026-07-31' })
  @IsOptional()
  @IsDateString()
  valid_until?: string;
}

export class ApprovePermitDto {
  @ApiProperty({ enum: APPROVAL_TIERS, description: 'Approver tier (§15.5)' })
  @IsIn(APPROVAL_TIERS)
  tier!: (typeof APPROVAL_TIERS)[number];
}
