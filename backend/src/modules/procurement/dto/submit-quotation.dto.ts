import {
  IsString,
  IsUUID,
  IsNumberString,
  IsInt,
  Min,
  IsISO8601,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitQuotationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  vendor_id!: string;

  @ApiProperty({
    description: 'Total quoted amount (DECIMAL(19,4) as string — must not use float)',
  })
  @IsNumberString()
  total_amount!: string;

  @ApiProperty({ maxLength: 3, description: 'ISO 4217 currency code' })
  @IsString()
  @MaxLength(3)
  currency_code!: string;

  @ApiProperty({ minimum: 1, description: 'Quotation validity in calendar days' })
  @IsInt()
  @Min(1)
  validity_days!: number;

  @ApiProperty({ format: 'date-time', description: 'When quotation was submitted (ISO 8601 UTC)' })
  @IsISO8601()
  submitted_at!: string;
}
