import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// structure_type controlled vocabulary — §10.2 (matches the CHECK constraint in the migration).
export enum StructureType {
  COLUMN = 'column',
  BEAM = 'beam',
  SLAB = 'slab',
  WALL = 'wall',
}

// Structure — §10.2 Physical Objects. Created under a building.
export class CreateStructureDto {
  @ApiProperty({ enum: StructureType })
  @IsEnum(StructureType)
  structure_type!: StructureType;

  @ApiPropertyOptional({ maxLength: 100, example: 'Reinforced concrete' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  material_type?: string;
}
