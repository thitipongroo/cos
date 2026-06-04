import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
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
}
