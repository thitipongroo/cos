import { IsUUID, IsOptional, IsNumber, IsPositive, IsDateString } from 'class-validator';

export class RecordUtilizationDto {
  @IsDateString()
  recorded_at!: string;

  @IsOptional()
  @IsUUID()
  project_id?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  hours_operated?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  fuel_consumed?: number;

  @IsOptional()
  @IsUUID()
  operator_id?: string;
}
