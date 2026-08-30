// Project Risk Controller — ADR-065 (risk register). Nested under projects (create/list), flat by id
// (edit/status). RBAC per §14: list = any authenticated tenant user; raise = PM / SITE_ENGINEER /
// TENANT_ADMIN; edit + status = PM / TENANT_ADMIN. Versioned under /api/v1 (QM-2).

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { RisksService } from './risks.service';
import { CreateRiskDto } from './dto/create-risk.dto';
import { UpdateRiskDto } from './dto/update-risk.dto';
import { RiskStatusDto } from './dto/risk-status.dto';
import { ListRisksDto } from './dto/list-risks.dto';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';

@ApiTags('Project Risks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class RisksController {
  constructor(private readonly service: RisksService) {}

  @Get('projects/:projectId/risks')
  @ApiOperation({ summary: 'List project risks (?status / ?category), highest-risk first' })
  @ApiParam({ name: 'projectId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Risk register (ordered by risk_score desc)' })
  list(@Param('projectId', ParseUUIDPipe) projectId: string, @Query() dto: ListRisksDto) {
    return this.service.list(projectId, dto);
  }

  @Post('projects/:projectId/risks')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.SITE_ENGINEER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Raise a risk under a project' })
  @ApiParam({ name: 'projectId', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Risk raised' })
  @ApiResponse({ status: 404, description: 'Parent project not found (COS-RISK-002)' })
  create(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CreateRiskDto) {
    return this.service.create(projectId, dto);
  }

  @Patch('risks/:riskId')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Edit a risk (likelihood / impact / mitigation, etc.)' })
  @ApiParam({ name: 'riskId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Updated risk' })
  @ApiResponse({ status: 404, description: 'Not found (COS-RISK-001)' })
  update(@Param('riskId', ParseUUIDPipe) riskId: string, @Body() dto: UpdateRiskDto) {
    return this.service.update(riskId, dto);
  }

  @Patch('risks/:riskId/status')
  @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Transition a risk status (OPEN/MITIGATING/CLOSED/ACCEPTED)' })
  @ApiParam({ name: 'riskId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Risk after status change' })
  @ApiResponse({ status: 404, description: 'Not found (COS-RISK-001)' })
  updateStatus(@Param('riskId', ParseUUIDPipe) riskId: string, @Body() dto: RiskStatusDto) {
    return this.service.updateStatus(riskId, dto);
  }
}
