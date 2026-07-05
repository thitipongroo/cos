import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListBuildingsDto {
  @ApiPropertyOptional({ description: 'Cursor for pagination (encoded building_id + created_at)' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size (max 100, default 20)' })
  @IsOptional()
  limit?: number;
}
