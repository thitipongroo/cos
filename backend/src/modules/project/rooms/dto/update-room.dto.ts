import { IsString, IsOptional, MaxLength, IsNumberString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateRoomDto {
  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  room_number?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  room_type?: string;

  @ApiPropertyOptional({ example: '24.50' })
  @IsOptional()
  @IsNumberString()
  area_sqm?: string;
}
