import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ResolveConflictDto {
  @ApiPropertyOptional({ description: 'Resolution notes for audit trail' })
  @IsOptional()
  @IsString()
  resolution_note?: string;
}
