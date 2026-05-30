import { IsEnum, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PlanType } from '@prisma/client';

export class CreateTenantDto {
  @ApiProperty({ example: 'acme_corp', description: 'Unique tenant code (lowercase, underscores)' })
  @IsString()
  @Matches(/^[a-z0-9_]{2,50}$/, { message: 'tenant_code must be 2-50 chars: lowercase letters, digits, underscores' })
  tenantCode!: string;

  @ApiProperty({ example: 'ACME Construction Co.' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  tenantName!: string;

  @ApiProperty({ enum: PlanType, example: 'STARTER' })
  @IsEnum(PlanType)
  planType!: PlanType;
}
