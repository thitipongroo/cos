import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { PlanType } from '@prisma/client';

export class CreateTenantDto {
  @ApiProperty({ example: 'acme_corp', description: 'Unique tenant code (lowercase, underscores)' })
  @IsString()
  @Matches(/^[a-z0-9_]{2,50}$/, {
    message: 'tenant_code must be 2-50 chars: lowercase letters, digits, underscores',
  })
  tenantCode!: string;

  @ApiProperty({ example: 'ACME Construction Co.' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  tenantName!: string;

  @ApiProperty({ enum: PlanType, example: 'STARTER' })
  @IsEnum(PlanType)
  planType!: PlanType;

  @ApiPropertyOptional({
    description: 'Dedicated PostgreSQL connection URL (ENTERPRISE plan only — spec §7.1)',
    example: 'postgresql://user:pass@host:5432/db',
  })
  @IsOptional()
  @IsUrl({ protocols: ['postgresql', 'postgres'], require_tld: false })
  @MaxLength(500)
  dedicatedDbUrl?: string;

  @ApiPropertyOptional({
    description:
      'Data-residency region (§5.6), assigned at provisioning and immutable after first data write. ' +
      'Thai tenants -> ap-southeast-7, EU -> eu-west-1, default -> ap-southeast-1.',
    enum: ['ap-southeast-7', 'ap-southeast-1', 'eu-west-1'],
    example: 'ap-southeast-1',
  })
  @IsOptional()
  @IsIn(['ap-southeast-7', 'ap-southeast-1', 'eu-west-1'])
  dataRegion?: string;
}
