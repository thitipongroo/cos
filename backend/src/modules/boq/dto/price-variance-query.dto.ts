import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** `GET /api/v1/boq/projects/:projectId/price-variance` */
export class PriceVarianceQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'The BOQ version to report. Default: the project`s newest version (highest version_number) — the ' +
      'DRAFT being estimated when one exists, since a DRAFT is always the newest.',
  })
  @IsOptional()
  @IsUUID()
  version_id?: string;
}
