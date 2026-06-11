import {
  IsString,
  IsOptional,
  IsDateString,
  IsNumberString,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMaterialConsumptionDto {
  @ApiProperty({ maxLength: 255, example: 'Portland Cement 50kg' })
  @IsString()
  @MaxLength(255)
  material_name!: string;

  @ApiProperty({
    description: 'Quantity consumed — decimal string to preserve precision',
    example: '12.5000',
  })
  @IsNumberString()
  @Matches(/^\d+(\.\d{1,4})?$/, { message: 'quantity must be a decimal with up to 4 places' })
  quantity!: string;

  @ApiProperty({ maxLength: 50, example: 'bag' })
  @IsString()
  @MaxLength(50)
  unit!: string;

  @ApiProperty({ description: 'ISO 8601 UTC timestamp', example: '2026-06-11T08:00:00Z' })
  @IsDateString()
  consumed_at!: string;

  @ApiPropertyOptional({
    description: 'Free-text task reference — no FK until Task entity exists',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  task_id?: string;
}
