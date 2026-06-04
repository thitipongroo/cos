import { IsString, IsOptional, IsInt, IsUUID, Length, Matches, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Validates decimal string: up to 19 integer digits + 4 decimal places, no negative
const DECIMAL_RE = /^\d{1,19}(\.\d{1,4})?$/;

export class AddBoqItemDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6', description: 'Category UUID' })
  @IsUUID()
  category_id!: string;

  @ApiPropertyOptional({ example: 'STR-01-001', description: 'Optional item code' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  item_code?: string;

  @ApiProperty({ example: 'Concrete grade C30 — column footing', description: 'Item description' })
  @IsString()
  @Length(1, 5000)
  description!: string;

  @ApiProperty({ example: 'm3', description: 'Unit of measure' })
  @IsString()
  @Length(1, 50)
  unit!: string;

  @ApiProperty({
    example: '150.0000',
    description: 'Quantity (decimal string, max 4 decimal places)',
  })
  @IsString()
  @Matches(DECIMAL_RE, {
    message: 'quantity must be a positive decimal string with up to 4 decimal places',
  })
  quantity!: string;

  @ApiProperty({
    example: '2800.0000',
    description: 'Unit cost in THB (decimal string, 4 decimal places)',
  })
  @IsString()
  @Matches(DECIMAL_RE, {
    message: 'unit_cost must be a positive decimal string with up to 4 decimal places',
  })
  unit_cost!: string;

  @ApiPropertyOptional({ example: 'THB', description: 'ISO 4217 currency code' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency_code must be a 3-letter ISO 4217 code' })
  currency_code: string = 'THB';

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;
}
