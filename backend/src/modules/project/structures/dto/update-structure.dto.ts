import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { StructureType } from './create-structure.dto';

export class UpdateStructureDto {
  @ApiPropertyOptional({ enum: StructureType })
  @IsOptional()
  @IsEnum(StructureType)
  structure_type?: StructureType;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  material_type?: string;
}
