import { IsInt, IsOptional, IsNumberString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateFloorDto {
  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  floor_number?: number;

  @ApiPropertyOptional({ example: '1250.50' })
  @IsOptional()
  @IsNumberString()
  gross_area_sqm?: string;
}
