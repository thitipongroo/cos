import {
  IsString,
  IsOptional,
  IsISO8601,
  IsArray,
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

  @ApiProperty({ type: [DeliveryItemDto], minItems: 1 })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveryItemDto)
  items!: DeliveryItemDto[];
}
