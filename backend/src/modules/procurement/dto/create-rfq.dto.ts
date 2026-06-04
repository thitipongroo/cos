import { IsString, IsUUID, IsDateString, IsOptional, MaxLength, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRfqDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  project_id!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Linked Purchase Request (optional)' })
  @IsOptional()
  @IsUUID()
  pr_id?: string;

  @ApiProperty({ maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  rfq_number!: string;

  @ApiProperty({ format: 'date-time', description: 'RFQ deadline (ISO 8601 UTC)' })
  @IsDateString()
  deadline!: string;
}
