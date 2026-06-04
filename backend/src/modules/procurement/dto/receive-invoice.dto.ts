import {
  IsString,
  IsUUID,
  IsDateString,
  IsOptional,
  MaxLength,
  IsNumberString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReceiveInvoiceDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  invoice_number!: string;

  @ApiProperty({ description: 'Invoice amount (DECIMAL(19,4) as string)' })
  @IsNumberString()
  amount!: string;

  @ApiProperty({ maxLength: 3, description: 'ISO 4217 currency code' })
  @IsString()
  @MaxLength(3)
  currency_code!: string;

  @ApiProperty({ format: 'date', description: 'Invoice date (YYYY-MM-DD)' })
  @IsDateString()
  invoice_date!: string;

  @ApiProperty({ format: 'date', description: 'Payment due date (YYYY-MM-DD)' })
  @IsDateString()
  due_date!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'File Service file_id for invoice document' })
  @IsOptional()
  @IsUUID()
  file_id?: string;
}
