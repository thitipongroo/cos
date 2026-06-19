import { IsOptional, IsUUID, IsEnum, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum TaskStatusInput {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  BLOCKED = 'BLOCKED',
  CANCELLED = 'CANCELLED',
}

export class UpdateTaskDto {
  @ApiPropertyOptional({ enum: TaskStatusInput })
  @IsOptional()
  @IsEnum(TaskStatusInput)
  status?: TaskStatusInput;

  @ApiPropertyOptional({ description: 'Progress 0–100 (Max-wins conflict resolution)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress_percent?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assigned_to?: string;
}
