import { IsEnum, IsDateString, IsOptional, IsNumber, IsPositive, IsString } from 'class-validator';

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
  @IsNumber()
  @IsPositive()
  cost?: number;

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
