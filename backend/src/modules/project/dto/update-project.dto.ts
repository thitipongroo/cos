import {
  IsString,
  IsOptional,
  MaxLength,
  IsDateString,
  IsNumberString,
  Length,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProjectDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  project_name?: string;

  @ApiPropertyOptional({ example: '5000000.0000' })
  @IsOptional()
  @IsNumberString()
  budget_amount?: string;

  @ApiPropertyOptional({ example: 'THB' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  budget_currency?: string;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional({ example: '2027-12-31' })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  // PM-entered projected completion date (nullable) — feeds AI delay-risk detection; falls back to
  // end_date when unset (11-database-schema §11.2, Phase 12 Delay Risk Detection).
  @ApiPropertyOptional({ example: '2027-11-15' })
  @IsOptional()
  @IsDateString()
  estimated_completion_date?: string;
}
