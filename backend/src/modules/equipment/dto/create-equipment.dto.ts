import { IsString, IsEnum, IsOptional, IsDateString, IsNumber, IsPositive } from 'class-validator';

export enum EquipmentType {
  CRANE = 'CRANE',
  EXCAVATOR = 'EXCAVATOR',
  CONCRETE_MIXER = 'CONCRETE_MIXER',
  GENERATOR = 'GENERATOR',
  SCAFFOLD = 'SCAFFOLD',
  VEHICLE = 'VEHICLE',
  OTHER = 'OTHER',
}

export class CreateEquipmentDto {
  @IsString()
  equipment_code!: string;

  @IsString()
  equipment_name!: string;

  @IsEnum(EquipmentType)
  equipment_type!: EquipmentType;

  @IsOptional()
  @IsDateString()
  purchase_date?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  purchase_cost?: number;

  @IsOptional()
  @IsString()
  currency_code?: string;
}
