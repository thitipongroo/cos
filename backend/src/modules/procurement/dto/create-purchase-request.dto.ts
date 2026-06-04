import { IsString, IsUUID, IsDateString, IsOptional, MaxLength, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePurchaseRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  project_id!: string;

  @ApiProperty({ maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  pr_number!: string;

  @ApiPropertyOptional({ format: 'date', description: 'Required delivery date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  required_date?: string;
}
