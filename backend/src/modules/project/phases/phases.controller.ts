// Project Phases Controller — Phase 3 amendment (ADR-070). Nested under projects (create/list),
// flat by id (update). RBAC: read = any authenticated tenant user; write = PROJECT_MANAGER or
// TENANT_ADMIN (mirrors buildings). Versioned under /api/v1 (QM-2).

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { PhasesService } from './phases.service';
import { CreatePhaseDto } from './dto/create-phase.dto';
import { UpdatePhaseDto } from './dto/update-phase.dto';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';

@ApiTags('Project Phases')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class PhasesController {
  constructor(private readonly service: PhasesService) {}

  @Post('projects/:projectId/phases')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create a phase under a project' })
  @ApiParam({ name: 'projectId', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Phase created' })
  @ApiResponse({ status: 404, description: 'Parent project not found (COS-PHASE-002)' })
  create(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CreatePhaseDto) {
    return this.service.create(projectId, dto);
  }

  @Get('projects/:projectId/phases')
  @ApiOperation({ summary: 'List project phases (ordered by seq)' })
  @ApiParam({ name: 'projectId', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Ordered phase list (current phase derived client-side)',
  })
  list(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.service.list(projectId);
  }

  @Patch('phases/:id')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Update a phase (status/seq advance, name, dates)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Updated phase' })
  @ApiResponse({ status: 404, description: 'Not found (COS-PHASE-001)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePhaseDto) {
    return this.service.update(id, dto);
  }
}
