import { IsString, IsEnum, IsOptional } from 'class-validator';

export enum EmploymentType {
  PERMANENT = 'PERMANENT',
  CONTRACT = 'CONTRACT',
  SUBCONTRACT = 'SUBCONTRACT',
}

export class CreateWorkerDto {
  @IsString()
  employee_code!: string;

  @IsString()
  full_name!: string;

  @IsString()
  trade_type!: string;

  @IsEnum(EmploymentType)
  employment_type!: EmploymentType;

  @IsOptional()
  @IsString()
  contact_phone?: string;
}
