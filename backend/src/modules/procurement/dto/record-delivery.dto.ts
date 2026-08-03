import {
  IsString,
  IsOptional,
  IsISO8601,
  IsArray,
  ArrayMaxSize,
  ValidateNested,
  IsUUID,
  MaxLength,
  IsNumberString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DeliveryItemDto {
  @ApiProperty({ format: 'uuid', description: 'po_line_items.line_id' })
  @IsUUID()
  line_id!: string;

  @ApiProperty({ description: 'Quantity received (DECIMAL(10,4) as string)' })
  @IsNumberString()
  quantity_received!: string;
}

export class RecordDeliveryDto {
  @ApiProperty({ format: 'uuid', description: 'Purchase order this delivery is recorded against' })
  @IsUUID()
  po_id!: string;

  @ApiPropertyOptional({ maxLength: 100, description: 'Delivery note / document reference' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  delivery_note?: string;

  @ApiProperty({ format: 'date-time', description: 'When delivery was received (ISO 8601 UTC)' })
  @IsISO8601()
  delivered_at!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  // Bounded for the same reason as CreatePurchaseOrderDto.line_items: one row per item, all inside a
  // single transaction. A delivery cannot have more lines than the PO it is recorded against.
  @ApiProperty({ type: [DeliveryItemDto], minItems: 1, maxItems: 500 })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => DeliveryItemDto)
  items!: DeliveryItemDto[];
}
