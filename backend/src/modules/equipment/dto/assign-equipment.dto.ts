import { IsUUID, IsOptional, IsString } from 'class-validator';

export class AssignEquipmentDto {
  @IsUUID()
  project_id!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReturnEquipmentDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
