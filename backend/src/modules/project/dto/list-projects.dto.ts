import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectType } from './create-project.dto';

export enum ProjectStatusFilter {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ON_HOLD = 'ON_HOLD',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export class ListProjectsDto {
  @ApiPropertyOptional({ enum: ProjectStatusFilter })
  @IsOptional()
  @IsEnum(ProjectStatusFilter)
  status?: ProjectStatusFilter;

  @ApiPropertyOptional({ enum: ProjectType })
  @IsOptional()
  @IsEnum(ProjectType)
  type?: ProjectType;

  @ApiPropertyOptional({ description: 'Full-text search on project_name or project_code' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'Cursor for pagination (encoded project_id + created_at)' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (max 100, default 20)' })
  @IsOptional()
  limit?: number;
}
