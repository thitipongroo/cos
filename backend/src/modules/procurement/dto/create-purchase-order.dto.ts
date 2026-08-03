import {
  IsString,
  IsUUID,
  IsDateString,
  IsOptional,
  IsArray,
  ArrayMaxSize,
  ValidateNested,
  IsNumberString,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PoLineItemDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Optional link to BOQ item' })
  @IsOptional()
  @IsUUID()
  boq_item_id?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({ description: 'Quantity (DECIMAL(10,4) as string)' })
  @IsNumberString()
  quantity!: string;

  @ApiProperty({ maxLength: 50 })
  @IsString()
  @MaxLength(50)
  unit!: string;

  @ApiProperty({ description: 'Unit price (DECIMAL(19,4) as string)' })
  @IsNumberString()
  unit_price!: string;
}

export class CreatePurchaseOrderDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Source RFQ (optional)' })
  @IsOptional()
  @IsUUID()
  rfq_id?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  vendor_id!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  project_id!: string;

  @ApiProperty({ maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  po_number!: string;

  @ApiProperty({ description: 'PO total amount (DECIMAL(19,4) as string)' })
  @IsNumberString()
  total_amount!: string;

  @ApiProperty({ maxLength: 3, description: 'ISO 4217 currency code' })
  @IsString()
  @MaxLength(3)
  currency_code!: string;

  @ApiProperty({ format: 'date', description: 'Expected delivery date (YYYY-MM-DD)' })
  @IsDateString()
  delivery_date!: string;

  // Bounded because every line becomes a row written inside ONE transaction: an unbounded array
  // holds that transaction (and its locks) open for as long as the client cares to make it. 500 is
  // far above any real purchase order while keeping the write bounded.
  @ApiProperty({ type: [PoLineItemDto], minItems: 1, maxItems: 500 })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PoLineItemDto)
  line_items!: PoLineItemDto[];
}
