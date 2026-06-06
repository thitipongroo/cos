import { IsString, IsNotEmpty, MaxLength, IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MaterialCategory, MaterialUnit } from './create-material.dto';

export class UpdateMaterialDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ enum: MaterialCategory })
  @IsOptional()
  @IsEnum(MaterialCategory)
  category?: MaterialCategory;

  @ApiPropertyOptional({ enum: MaterialUnit })
  @IsOptional()
  @IsEnum(MaterialUnit)
  unit?: MaterialUnit;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
