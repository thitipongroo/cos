import { IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { RiskCategory, RiskStatus } from './create-risk.dto';

// Filters for the risk register listing (§14 — ?status / ?category).
export class ListRisksDto {
  @ApiPropertyOptional({ enum: RiskStatus })
  @IsOptional()
  @IsEnum(RiskStatus)
  status?: RiskStatus;

  @ApiPropertyOptional({ enum: RiskCategory })
  @IsOptional()
  @IsEnum(RiskCategory)
  category?: RiskCategory;
}
