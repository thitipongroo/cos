import { IsInt, IsOptional, IsNumberString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Floor — §10.2 Physical Objects. Created under a building.
export class CreateFloorDto {
  @ApiProperty({ example: 5, description: 'Floor number (may be negative for basements)' })
  @IsInt()
  floor_number!: number;

  @ApiPropertyOptional({
    example: '1250.50',
    description: 'DECIMAL(12,2) gross area, m² as string',
  })
  @IsOptional()
  @IsNumberString()
  gross_area_sqm?: string;
}
