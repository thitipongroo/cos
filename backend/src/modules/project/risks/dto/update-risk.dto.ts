import { IsString, IsInt, Min, Max, IsOptional, MaxLength, IsEnum, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { RiskCategory } from './create-risk.dto';

// Edit a risk (ADR-065 / §14 — likelihood / impact / mitigation, plus title/description/category/owner).
// All optional — partial update (COALESCE keeps unspecified columns unchanged). Status is NOT here; it
// transitions through its own PATCH .../status endpoint.
export class UpdateRiskDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: RiskCategory })
  @IsOptional()
  @IsEnum(RiskCategory)
  category?: RiskCategory;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  likelihood?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  impact?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mitigation?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  owner?: string;
}
