import { IsString, IsNotEmpty, IsUUID, IsDateString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDecimalString } from '@cos/validation';

export class RecordPaymentDto {
  @ApiProperty({ description: 'Procurement invoice UUID', format: 'uuid' })
  @IsUUID()
  invoice_id!: string;

  @ApiProperty({ description: 'Payment amount (DECIMAL string)' })
  @IsDecimalString()
  amount!: string;

  @ApiProperty({ description: 'ISO 4217 currency code', example: 'THB' })
  @IsString()
  @IsNotEmpty()
  currency_code!: string;

  @ApiProperty({ description: 'Payment date', example: '2026-06-05' })
  @IsDateString()
  payment_date!: string;

  @ApiPropertyOptional({ description: 'Bank reference or transfer number' })
  @IsOptional()
  @IsString()
  payment_reference?: string;
}
