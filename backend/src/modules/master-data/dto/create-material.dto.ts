import { IsString, IsNotEmpty, MaxLength, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum MaterialCategory {
  CONCRETE = 'CONCRETE',
  STEEL = 'STEEL',
  FORMWORK = 'FORMWORK',
  ELECTRICAL = 'ELECTRICAL',
  PLUMBING = 'PLUMBING',
  FINISHES = 'FINISHES',
  EQUIPMENT = 'EQUIPMENT',
  OTHER = 'OTHER',
}

export enum MaterialUnit {
  KG = 'KG',
  TON = 'TON',
  M3 = 'M3',
  M2 = 'M2',
  M = 'M',
  UNIT = 'UNIT',
  SET = 'SET',
  BAG = 'BAG',
  ROLL = 'ROLL',
}

export class CreateMaterialDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiProperty({ enum: MaterialCategory })
  @IsEnum(MaterialCategory)
  category!: MaterialCategory;

  @ApiProperty({ enum: MaterialUnit })
  @IsEnum(MaterialUnit)
  unit!: MaterialUnit;
}
