import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ProjectTransitionTarget {
  ACTIVE = 'ACTIVE',
  ON_HOLD = 'ON_HOLD',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export class TransitionProjectDto {
  @ApiProperty({ enum: ProjectTransitionTarget, description: 'Target status to transition to' })
  @IsEnum(ProjectTransitionTarget)
  to!: ProjectTransitionTarget;

  @ApiPropertyOptional({
    maxLength: 500,
    description: 'Required when transitioning to ON_HOLD or CANCELLED',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
