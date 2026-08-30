// Safety Controller — Phase 6 (§14 Safety APIs + §20.7.7)
// Canonical prefix /api/v1/safety/* (ADR-027). Checklists delegate to SiteOpsService.

import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  ParseUUIDPipe,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { PolicyGuard } from '../../shared/guards/policy.guard';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { SafetyService } from './safety.service';
import { SiteOpsService } from '../site-ops/site-ops.service';
import {
  CreateIncidentDto,
  CreatePermitDto,
  ApprovePermitDto,
  RejectPermitDto,
} from './dto/safety.dto';
import { SubmitInspectionDto } from '../site-ops/public/submit-inspection.dto';

const SAFETY_READ_ROLES = [
  CosRole.EXECUTIVE,
  CosRole.PROJECT_MANAGER,
  CosRole.SITE_ENGINEER,
  CosRole.SAFETY_OFFICER,
  CosRole.TENANT_ADMIN,
] as const;
const PERMIT_APPROVE_ROLES = [
  CosRole.SAFETY_OFFICER,
  CosRole.PROJECT_MANAGER,
  CosRole.TENANT_ADMIN,
] as const;

function parsePage(page: string): number {
  return Math.max(1, parseInt(page, 10) || 1);
}
function parseLimit(limit: string): number {
  return Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
}

@ApiTags('safety')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PolicyGuard)
@Controller()
export class SafetyController {
  constructor(
    private readonly svc: SafetyService,
    private readonly siteOps: SiteOpsService,
  ) {}

  // ── Incidents ───────────────────────────────────────────────────────────────

  // POST /api/v1/safety/incidents
  @Post('safety/incidents')
  @Roles(CosRole.SITE_ENGINEER, CosRole.SAFETY_OFFICER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Report a safety incident' })
  createIncident(@Body() dto: CreateIncidentDto) {
    return this.svc.createIncident(dto);
  }

  // GET /api/v1/safety/incidents
  @Get('safety/incidents')
  @Roles(...SAFETY_READ_ROLES)
  @ApiOperation({ summary: 'List incidents (filter by project, status, severity)' })
  @ApiQuery({ name: 'project_id', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'severity', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listIncidents(
    @Query('project_id') project_id?: string,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.listIncidents({
      project_id,
      status,
      severity,
      page: parsePage(page),
      limit: parseLimit(limit),
    });
  }

  // PATCH /api/v1/safety/incidents/:incidentId/acknowledge
  @Patch('safety/incidents/:incidentId/acknowledge')
  @Roles(CosRole.SAFETY_OFFICER, CosRole.TENANT_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Acknowledge an incident (OPEN → IN_PROGRESS)' })
  @ApiParam({ name: 'incidentId', type: 'string', format: 'uuid' })
  acknowledgeIncident(@Param('incidentId', ParseUUIDPipe) incidentId: string) {
    return this.svc.acknowledgeIncident(incidentId);
  }

  // ── Permits ───────────────────────────────────────────────────────────────

  // POST /api/v1/safety/permits
  @Post('safety/permits')
  @Roles(CosRole.SITE_ENGINEER, CosRole.SAFETY_OFFICER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create a permit request (PENDING)' })
  createPermit(@Body() dto: CreatePermitDto) {
    return this.svc.createPermit(dto);
  }

  // GET /api/v1/safety/permits
  @Get('safety/permits')
  @Roles(...SAFETY_READ_ROLES)
  @ApiOperation({ summary: 'List permits (filter by project, status)' })
  @ApiQuery({ name: 'project_id', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listPermits(
    @Query('project_id') project_id?: string,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.listPermits({
      project_id,
      status,
      page: parsePage(page),
      limit: parseLimit(limit),
    });
  }

  // PATCH /api/v1/safety/permits/:permitId/approve  (§15.5)
  @Patch('safety/permits/:permitId/approve')
  @Roles(...PERMIT_APPROVE_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a permit (PENDING → ACTIVE; SAFETY_PERMIT needs PM final)' })
  @ApiParam({ name: 'permitId', type: 'string', format: 'uuid' })
  approvePermit(@Param('permitId', ParseUUIDPipe) permitId: string, @Body() dto: ApprovePermitDto) {
    return this.svc.approvePermit(permitId, dto.tier);
  }

  // PATCH /api/v1/safety/permits/:permitId/reject
  @Patch('safety/permits/:permitId/reject')
  @Roles(...PERMIT_APPROVE_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a permit (PENDING → REVOKED)' })
  @ApiParam({ name: 'permitId', type: 'string', format: 'uuid' })
  // `dto` is optional and so is its one field: this endpoint accepted NO body before 2026-08-13,
  // and the mobile app still sends `{}`. Defaulting keeps a body-less call valid (QM-2).
  rejectPermit(@Param('permitId', ParseUUIDPipe) permitId: string, @Body() dto?: RejectPermitDto) {
    return this.svc.rejectPermit(permitId, dto?.reason);
  }

  // ── Checklists (delegated to SiteOps — ADR-027) ─────────────────────────────

  // GET /api/v1/safety/checklists
  @Get('safety/checklists')
  @Roles(
    CosRole.SITE_WORKER,
    CosRole.SITE_ENGINEER,
    CosRole.PROJECT_MANAGER,
    CosRole.SAFETY_OFFICER,
    CosRole.EXECUTIVE,
    CosRole.TENANT_ADMIN,
  )
  @ApiOperation({ summary: 'List safety checklists (filterable by project)' })
  @ApiQuery({ name: 'project_id', required: false, type: String })
  listChecklists(@Query('project_id') project_id?: string) {
    return this.siteOps.listChecklists(project_id);
  }

  // POST /api/v1/safety/checklists  (submit a completed checklist = inspection)
  //
  // SITE_WORKER is included (product-owner decision 2026-08-08, ADR-089): the daily safety
  // verification is the field worker's own pre-shift routine, and §6.8 grants the role RW on Safety.
  // This resolves — for THIS route only — the §6.8-vs-§14 conflict that sync-authz.ts recorded as
  // unresolved. Incident reporting (`POST /safety/incidents`) is deliberately NOT widened: §14 keeps
  // that at Site Engineer / Safety Officer / Admin and the decision did not cover it.
  @Post('safety/checklists')
  @Roles(CosRole.SITE_WORKER, CosRole.SITE_ENGINEER, CosRole.SAFETY_OFFICER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Submit a completed safety checklist (recorded as an inspection)' })
  submitChecklist(@Body() dto: SubmitInspectionDto) {
    return this.siteOps.submitInspection(dto);
  }

  // ── Compliance ──────────────────────────────────────────────────────────────

  // GET /api/v1/safety/compliance
  @Get('safety/compliance')
  @Roles(...SAFETY_READ_ROLES)
  @ApiOperation({ summary: 'Compliance summary — open incidents and bad permits' })
  @ApiQuery({ name: 'project_id', required: false, type: String })
  getCompliance(@Query('project_id') project_id?: string) {
    return this.svc.getCompliance(project_id);
  }
}
