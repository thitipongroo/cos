import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDecimalString } from '@cos/validation';

export class AddBudgetLineDto {
  @ApiProperty({ description: 'Budget line name', example: 'Structural Works' })
  @IsString()
  @IsNotEmpty()
  line_name!: string;

  @ApiProperty({ description: 'Allocated amount for this line (DECIMAL string)' })
  @IsDecimalString()
  allocated_amount!: string;

  @ApiProperty({ description: 'ISO 4217 currency code', example: 'THB' })
  @IsString()
  @IsNotEmpty()
  currency_code!: string;

  @ApiPropertyOptional({ description: 'Loose reference to BOQ category UUID', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  boq_category_id?: string;
}
