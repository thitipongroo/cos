import { IsString, IsOptional, IsInt, Length, Matches, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const DECIMAL_RE = /^\d{1,19}(\.\d{1,4})?$/;

export class UpdateBoqItemDto {
  @ApiPropertyOptional({ example: 'Updated footing description' })
  @IsOptional()
  @IsString()
  @Length(1, 5000)
  description?: string;

  @ApiPropertyOptional({ example: 'm3' })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  unit?: string;

  @ApiPropertyOptional({ example: '200.0000' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_RE, {
    message: 'quantity must be a positive decimal string with up to 4 decimal places',
  })
  quantity?: string;

  @ApiPropertyOptional({ example: '3200.0000' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_RE, {
    message: 'unit_cost must be a positive decimal string with up to 4 decimal places',
  })
  unit_cost?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;
}
