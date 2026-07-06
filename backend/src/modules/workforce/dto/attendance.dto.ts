import { IsUUID, IsDateString, IsOptional, IsNumber, Min, Max } from 'class-validator';

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

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}
