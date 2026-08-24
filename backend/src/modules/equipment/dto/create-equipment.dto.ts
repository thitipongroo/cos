import { IsString, IsEnum, IsOptional, IsDateString } from 'class-validator';
import { IsDecimalString } from '@cos/validation';

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

  // A DECIMAL STRING, not a JS number: master:990 — "Never use JavaScript Number for monetary
  // calculations" — and the column is DECIMAL(19,4). @IsNumber() parsed the body into a float
  // before anything could round it, which is the same class of bug as the PO approval tier that
  // parseFloat-ed its total. finance and boq already take money this way.
  @IsOptional()
  @IsDecimalString()
  purchase_cost?: string;

  @IsOptional()
  @IsString()
  currency_code?: string;
}
