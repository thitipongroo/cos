import { IsUUID, IsDateString, IsOptional, IsNumber } from 'class-validator';

export class SubmitTimesheetDto {
  @IsUUID()
  worker_id!: string;

  @IsUUID()
  project_id!: string;

  @IsDateString()
  period_date!: string;

  @IsOptional()
  @IsNumber()
  regular_hours?: number;

  @IsOptional()
  @IsNumber()
  overtime_hours?: number;
}
