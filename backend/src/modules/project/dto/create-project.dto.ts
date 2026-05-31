import {
  IsString,
  IsEnum,
  IsOptional,
  MaxLength,
  IsDateString,
  IsNumberString,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ProjectType {
  RESIDENTIAL = 'RESIDENTIAL',
  COMMERCIAL = 'COMMERCIAL',
  INFRASTRUCTURE = 'INFRASTRUCTURE',
  INDUSTRIAL = 'INDUSTRIAL',
}

export class CreateProjectDto {
  @ApiProperty({ maxLength: 50, example: 'PROJ-2026-001' })
  @IsString()
  @MaxLength(50)
  project_code!: string;

  @ApiProperty({ maxLength: 255, example: 'Riverside Tower A' })
  @IsString()
  @MaxLength(255)
  project_name!: string;

  @ApiProperty({ enum: ProjectType })
  @IsEnum(ProjectType)
  project_type!: ProjectType;

  @ApiPropertyOptional({ example: '5000000.0000', description: 'DECIMAL(19,4) as string' })
  @IsOptional()
  @IsNumberString()
  budget_amount?: string;

  @ApiPropertyOptional({ example: 'THB', description: 'ISO 4217 currency code' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  budget_currency?: string;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional({ example: '2027-12-31' })
  @IsOptional()
  @IsDateString()
  end_date?: string;
}
