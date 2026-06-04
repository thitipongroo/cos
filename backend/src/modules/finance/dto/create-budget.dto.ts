import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDecimalString } from '@cos/validation';

export class CreateBudgetDto {
  @ApiProperty({ description: 'Total budget amount (DECIMAL string — never float)' })
  @IsDecimalString()
  total_budget_amount!: string;

  @ApiProperty({ description: 'ISO 4217 currency code', example: 'THB' })
  @IsString()
  @IsNotEmpty()
  total_budget_currency!: string;

  @ApiPropertyOptional({ description: 'Variance alert threshold %, default 10', example: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  variance_alert_threshold?: number;
}
