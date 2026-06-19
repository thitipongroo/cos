// DTOs for the CRM module (§11.2 Lead / Opportunity / Contact).
import { IsString, IsNotEmpty, IsUUID, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDecimalString } from '@cos/validation';

export class CreateLeadDto {
  @ApiPropertyOptional({ description: 'Initial point-of-contact name' })
  @IsOptional()
  @IsString()
  contact_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional({ description: 'Lead source (referral, web, ...)' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assigned_to?: string;
}

export class CreateOpportunityDto {
  @ApiProperty({ description: 'Lead this opportunity is qualified from', format: 'uuid' })
  @IsUUID()
  lead_id!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional({ description: 'Commercial value (DECIMAL string)' })
  @IsOptional()
  @IsDecimalString()
  value?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  expected_close_date?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assigned_to?: string;
}

export class CreateContactDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  lead_id!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  role?: string;
}
