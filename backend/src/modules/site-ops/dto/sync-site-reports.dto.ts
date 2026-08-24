import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMaxSize,
  ValidateNested,
  IsString,
  IsOptional,
  IsDateString,
  IsUUID,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreateSiteReportDto } from './create-site-report.dto';

export class SyncItemDto extends CreateSiteReportDto {
  @ApiProperty({ description: 'Client-generated UUID for idempotency', format: 'uuid' })
  @IsUUID()
  client_id!: string;

  @ApiProperty({ description: 'Last known server modified_at (for conflict detection)' })
  @IsOptional()
  @IsDateString()
  last_known_modified_at?: string;
}

export class SyncSiteReportsDto {
  // Each item costs a read plus a write, run sequentially, so an unbounded batch is an unbounded
  // request. A device syncing a longer backlog sends several batches — which is also what the client
  // must already do to make progress across a flaky link.
  @ApiProperty({ type: [SyncItemDto], maxItems: 200 })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SyncItemDto)
  items!: SyncItemDto[];
}

export class SyncIssueItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  client_id!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  project_id!: string;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty({ enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  @IsString()
  severity!: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @ApiProperty({ enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] })
  @IsString()
  status!: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  report_id?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  client_submitted_at?: string;

  @ApiProperty({ required: false, description: 'For conflict detection' })
  @IsOptional()
  @IsDateString()
  last_known_modified_at?: string;
}
