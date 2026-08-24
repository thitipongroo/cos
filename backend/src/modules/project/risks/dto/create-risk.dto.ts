import { IsString, IsInt, Min, Max, IsOptional, MaxLength, IsEnum, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Project risk category / status (ADR-065, §11). Mirror the CHECK constraints on projects.project_risk.
export enum RiskCategory {
  SAFETY = 'SAFETY',
  FINANCIAL = 'FINANCIAL',
  SCHEDULE = 'SCHEDULE',
  TECHNICAL = 'TECHNICAL',
  EXTERNAL = 'EXTERNAL',
  OTHER = 'OTHER',
}

export enum RiskStatus {
  OPEN = 'OPEN',
  MITIGATING = 'MITIGATING',
  CLOSED = 'CLOSED',
  ACCEPTED = 'ACCEPTED',
}

// Raise a risk (ADR-065). source is always MANUAL for an API-raised risk (the Layer B AI feed sets
// AI_SUGGESTED itself); status defaults to OPEN and risk_score is generated — none are client input.
export class CreateRiskDto {
  @ApiProperty({ maxLength: 255, example: 'Ground water ingress in Zone B basement' })
  @IsString()
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: RiskCategory })
  @IsEnum(RiskCategory)
  category!: RiskCategory;

  @ApiProperty({ minimum: 1, maximum: 5, example: 3, description: 'Likelihood 1–5' })
  @IsInt()
  @Min(1)
  @Max(5)
  likelihood!: number;

  @ApiProperty({ minimum: 1, maximum: 5, example: 4, description: 'Impact 1–5' })
  @IsInt()
  @Min(1)
  @Max(5)
  impact!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mitigation?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Risk owner (user_id)' })
  @IsOptional()
  @IsUUID()
  owner?: string;
}
