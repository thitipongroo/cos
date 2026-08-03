import {
  IsString,
  IsUUID,
  IsDateString,
  IsOptional,
  MaxLength,
  IsNotEmpty,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  IsNumber,
  IsPositive,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PurchaseRequestItemDto {
  @ApiProperty({ description: 'What is being requested, e.g. "เหล็กเส้น DB12"' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description!: string;

  @ApiProperty({ description: 'How much is needed; must be > 0', example: 20 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  quantity!: number;

  @ApiProperty({ maxLength: 50, example: 'ton' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  unit!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Optional procurement.materials link. Omit for anything not in the catalogue — a site ' +
      'shortage must never be blocked on cataloguing it first.',
  })
  @IsOptional()
  @IsUUID()
  material_id?: string;
}

export class CreatePurchaseRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  project_id!: string;

  @ApiPropertyOptional({
    maxLength: 50,
    description:
      'Document number, unique per tenant. Optional: omit it and the server allocates the next ' +
      'PR-<year>-<seq> for the tenant. The mobile requisition form omits it — a site engineer ' +
      'cannot be asked to invent a unique document number on their phone. The web form still ' +
      'sends its own.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  pr_number?: string;

  @ApiPropertyOptional({ format: 'date', description: 'Required delivery date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  required_date?: string;

  @ApiPropertyOptional({
    type: [PurchaseRequestItemDto],
    minItems: 1,
    maxItems: 500,
    description:
      'What is being requested (procurement.pr_line_items). Optional only for backward ' +
      'compatibility: the web form at apps/web/.../procurement/requests predates line items and ' +
      'sends none, so requiring them would 400 a working screen. Send at least one from any new ' +
      'client — a request with no lines records that someone asked for something, but not what.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  // Upper bound for the same reason as the PO: one row per line inside a single transaction.
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestItemDto)
  items?: PurchaseRequestItemDto[];
}
