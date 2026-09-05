import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * One Task → Task schedule edge (ADR-097).
 *
 * Validation is class-validator, never a hand-written `if` (QM-4). What it CANNOT check is the two
 * rules that need the rest of the graph — both tasks existing in this project, and the edge not
 * closing a cycle — so `TasksService.addDependency` does those and raises COS-TASK-002 /
 * COS-TASK-004 / COS-TASK-003.
 */
export class CreateDependencyDto {
  @ApiProperty({ description: 'The task that must happen first', format: 'uuid' })
  @IsUUID()
  predecessor_task_id!: string;

  @ApiProperty({ description: 'The task that follows it', format: 'uuid' })
  @IsUUID()
  successor_task_id!: string;

  @ApiPropertyOptional({
    description:
      'Precedence relationship — FS finish-to-start, SS start-to-start, FF finish-to-finish, ' +
      'SF start-to-finish. Defaults to FS, which is the ordinary construction case.',
    enum: ['FS', 'SS', 'FF', 'SF'],
    default: 'FS',
  })
  @IsOptional()
  @IsIn(['FS', 'SS', 'FF', 'SF'])
  dependency_type?: 'FS' | 'SS' | 'FF' | 'SF';

  @ApiPropertyOptional({
    description:
      'Days between the two ends of the relationship. SIGNED: a negative value is a lead ' +
      '("start three days before the predecessor finishes"), which is ordinary in scheduling. ' +
      'Bounded at ±3650 so a typo cannot push a task a century out.',
    default: 0,
    minimum: -3650,
    maximum: 3650,
  })
  @IsOptional()
  @IsInt()
  @Min(-3650)
  @Max(3650)
  lag_days?: number;
}
