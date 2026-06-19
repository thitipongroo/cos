import { IsString, IsNotEmpty, IsOptional, IsUUID, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTaskDto {
  @ApiProperty({ description: 'Task name' })
  @IsString()
  @IsNotEmpty()
  task_name!: string;

  @ApiPropertyOptional({ description: 'Task category (construction / rfi / administrative)' })
  @IsOptional()
  @IsString()
  work_type?: string;

  @ApiPropertyOptional({ description: 'Linked BOQ line item', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  boq_item_id?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  floor_id?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  room_id?: string;

  @ApiPropertyOptional({ description: 'Assignee employee id', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assigned_to?: string;

  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @IsDateString()
  planned_start?: string;

  @ApiPropertyOptional({ example: '2026-07-10' })
  @IsOptional()
  @IsDateString()
  planned_end?: string;
}
