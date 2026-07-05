import { IsString, IsOptional, MaxLength, IsNumberString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Room — §10.2 Physical Objects. Created under a floor.
export class CreateRoomDto {
  @ApiProperty({ maxLength: 50, example: '12-A' })
  @IsString()
  @MaxLength(50)
  room_number!: string;

  @ApiPropertyOptional({ maxLength: 100, example: 'BEDROOM' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  room_type?: string;

  @ApiPropertyOptional({ example: '24.50', description: 'DECIMAL(12,2) area, m² as string' })
  @IsOptional()
  @IsNumberString()
  area_sqm?: string;
}
