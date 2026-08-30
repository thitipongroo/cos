import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IssueStatus } from './update-issue.dto';

/**
 * Body of PATCH /api/v1/site/issues/:issueId/status (§35.13 ESC-21).
 *
 * Deliberately separate from UpdateIssueDto: that endpoint carries offline-sync semantics and
 * applies FIELD_LEVEL_MERGE, under which the server's status always wins — so a status sent there
 * is discarded by design. This endpoint is the direct, online transition and carries no conflict
 * fields at all.
 */
export class ChangeIssueStatusDto {
  @ApiProperty({ enum: IssueStatus })
  @IsEnum(IssueStatus)
  status!: IssueStatus;

  @ApiPropertyOptional({
    description: 'Recorded alongside the transition (e.g. why it was closed)',
  })
  @IsOptional()
  @IsString()
  resolution_note?: string;
}
