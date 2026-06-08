import { IsUUID, IsDateString, IsOptional, IsNumber } from 'class-validator';

export class RecordAttendanceDto {
  @IsUUID()
  project_id!: string;

  @IsOptional()
  @IsDateString()
  check_in_at?: string;

  @IsOptional()
  @IsDateString()
  check_out_at?: string;

  @IsOptional()
  @IsNumber()
  hours_worked?: number;
}
