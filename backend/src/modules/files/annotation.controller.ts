// Photo-annotation controller (ADR-056). GET only — writing an annotation flows through the offline
// sync path (`POST /api/v1/sync/push` with entity_type "photo_annotation"), never a REST write, so it
// is consistent with every other field-editable entity (14-api-architecture §Files APIs).

import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { AnnotationService } from './annotation.service';

@ApiTags('files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class AnnotationController {
  constructor(private readonly svc: AnnotationService) {}

  // GET /api/v1/files/:fileId/annotation
  @Get('files/:fileId/annotation')
  @ApiOperation({ summary: "Get a photo's annotation stroke list + version (404 if none)" })
  @ApiParam({ name: 'fileId', type: 'string', format: 'uuid' })
  getAnnotation(@Param('fileId', ParseUUIDPipe) fileId: string) {
    return this.svc.getByFileId(fileId);
  }
}
