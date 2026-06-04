import { IsString, IsOptional, IsDateString, IsInt, Min, MaxLength, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSiteReportDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  project_id!: string;

  @ApiProperty({ example: '2026-06-04', description: 'YYYY-MM-DD' })
  @IsDateString()
  report_date!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  weather?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  manpower_count?: number;

  @ApiPropertyOptional({
    description: 'Device clock timestamp — ISO 8601 UTC',
    example: '2026-06-04T08:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  client_submitted_at?: string;
}
