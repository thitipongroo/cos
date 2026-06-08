import { IsUUID, IsString, IsDateString, IsOptional, IsNumber, IsPositive } from 'class-validator';

export class AllocateWorkerDto {
  @IsUUID()
  worker_id!: string;

  @IsOptional()
  @IsString()
  role_on_project?: string;

  @IsDateString()
  start_date!: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  daily_rate?: number;

  @IsOptional()
  @IsString()
  currency_code?: string;
}
