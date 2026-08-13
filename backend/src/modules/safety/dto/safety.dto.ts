// DTOs for the Safety module (§11 Incidents / Permit, §14, §15.5 permit approval).

import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsOptional,
  IsIn,
  IsDateString,
  IsNumber,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
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

  // Added 2026-08-13 with the Safety Officer permit screens
  // (mockup/mobile/07_safety_officer/04_permit_management/02_permit_request). OPTIONAL, so an
  // existing client that posts neither keeps working — a new optional field is a non-breaking
  // addition and needs no version bump (QM-2).
  @ApiPropertyOptional({
    maxLength: 255,
    description:
      'Firm performing the permitted work. Free text — not an FK to procurement.vendors.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  contractor_name?: string;

  @ApiPropertyOptional({ maxLength: 4000, description: 'Scope of work and safety measures' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;
}

export class ApprovePermitDto {
  @ApiProperty({ enum: APPROVAL_TIERS, description: 'Approver tier (§15.5)' })
  @IsIn(APPROVAL_TIERS)
  tier!: (typeof APPROVAL_TIERS)[number];
}

/**
 * Body of `PATCH /safety/permits/:permitId/reject`.
 *
 * The endpoint took NO body until 2026-08-13, so `reason` is OPTIONAL and the whole DTO is
 * optional at the controller: a client that still sends `{}` — which is what the mobile app did
 * until this change — must keep working (QM-2 breaking-change rules). A rejection with no reason
 * therefore stores NULL, which is honest: nobody gave one.
 */
export class RejectPermitDto {
  @ApiPropertyOptional({ maxLength: 500, description: 'Why the permit was rejected/revoked' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
