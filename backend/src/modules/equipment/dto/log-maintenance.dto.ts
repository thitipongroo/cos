import { IsEnum, IsDateString, IsOptional, IsString } from 'class-validator';
import { IsDecimalString } from '@cos/validation';

export enum MaintenanceType {
  SCHEDULED = 'SCHEDULED',
  UNSCHEDULED = 'UNSCHEDULED',
  REPAIR = 'REPAIR',
}

export class LogMaintenanceDto {
  @IsEnum(MaintenanceType)
  maintenance_type!: MaintenanceType;

  @IsDateString()
  scheduled_at!: string;

  @IsOptional()
  // DECIMAL string — see create-equipment.dto.ts; master:990.
  @IsDecimalString()
  cost?: string;

  @IsOptional()
  @IsString()
  currency_code?: string;

  @IsOptional()
  @IsString()
  performed_by?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
