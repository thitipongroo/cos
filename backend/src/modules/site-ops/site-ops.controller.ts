// SiteOps Controller — Phase 6
// RBAC per spec §06-rbac-permission-matrix.md:
//   Site reports:      SITE_WORKER, SITE_ENGINEER can create/submit
//   Issues:            SITE_WORKER, SITE_ENGINEER, PROJECT_MANAGER, TENANT_ADMIN can create/update
//   Inspections:       SITE_ENGINEER, SAFETY_OFFICER can submit
//   Conflict records:  SITE_ENGINEER, PROJECT_MANAGER, TENANT_ADMIN can view/resolve
//   All listing:       read roles include EXECUTIVE, PROJECT_MANAGER, TENANT_ADMIN

import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { SiteOpsService } from './site-ops.service';
import { CreateSiteReportDto } from './dto/create-site-report.dto';
import { SyncSiteReportsDto } from './dto/sync-site-reports.dto';
import { CreateIssueDto } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { SubmitInspectionDto } from './dto/submit-inspection.dto';
import { ResolveConflictDto } from './dto/resolve-conflict.dto';
import { CreateMaterialConsumptionDto } from './dto/create-material-consumption.dto';

@ApiTags('site-ops')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class SiteOpsController {
  constructor(private readonly svc: SiteOpsService) {}

  // ── Site Reports ──────────────────────────────────────────────────────────

  // POST /api/v1/site-reports
  @Post('site-reports')
  @Roles(CosRole.SITE_WORKER, CosRole.SITE_ENGINEER, CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create or upsert a site report (offline-sync compatible)' })
  createSiteReport(@Body() dto: CreateSiteReportDto) {
    return this.svc.createSiteReport(dto);
  }

  // GET /api/v1/site-reports
  @Get('site-reports')
  @Roles(
    CosRole.SITE_WORKER,
    CosRole.SITE_ENGINEER,
    CosRole.PROJECT_MANAGER,
    CosRole.EXECUTIVE,
    CosRole.TENANT_ADMIN,
  )
  @ApiOperation({ summary: 'List site reports (paginated, date range filter)' })
  @ApiQuery({ name: 'project_id', required: false, type: String })
  @ApiQuery({ name: 'from_date', required: false, type: String, example: '2026-06-01' })
  @ApiQuery({ name: 'to_date', required: false, type: String, example: '2026-06-30' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'minimal',
    required: false,
    type: Boolean,
    description: 'Reduced payload for mobile',
  })
  listSiteReports(
    @Query('project_id') project_id?: string,
    @Query('from_date') from_date?: string,
    @Query('to_date') to_date?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('minimal') minimal?: string,
  ) {
    return this.svc.listSiteReports({
      project_id,
      from_date,
      to_date,
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
      minimal: minimal === 'true',
    });
  }

  // GET /api/v1/site-reports/:reportId
  @Get('site-reports/:reportId')
  @Roles(
    CosRole.SITE_WORKER,
    CosRole.SITE_ENGINEER,
    CosRole.PROJECT_MANAGER,
    CosRole.EXECUTIVE,
    CosRole.TENANT_ADMIN,
  )
  @ApiOperation({ summary: 'Get site report by ID' })
  @ApiParam({ name: 'reportId', type: 'string', format: 'uuid' })
  getSiteReport(@Param('reportId') reportId: string) {
    return this.svc.getSiteReport(reportId);
  }

  // POST /api/v1/site-reports/sync
  @Post('site-reports/sync')
  @Roles(CosRole.SITE_WORKER, CosRole.SITE_ENGINEER, CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk offline sync — accepts array of reports; returns per-item conflict_status',
  })
  syncSiteReports(@Body() dto: SyncSiteReportsDto) {
    return this.svc.syncSiteReports(dto);
  }

  // ── Issues ────────────────────────────────────────────────────────────────

  // POST /api/v1/issues
  @Post('issues')
  @Roles(CosRole.SITE_WORKER, CosRole.SITE_ENGINEER, CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create a site issue (offline-sync compatible)' })
  createIssue(@Body() dto: CreateIssueDto) {
    return this.svc.createIssue(dto);
  }

  // PATCH /api/v1/issues/:issueId
  @Patch('issues/:issueId')
  @Roles(
    CosRole.SITE_WORKER,
    CosRole.SITE_ENGINEER,
    CosRole.PROJECT_MANAGER,
    CosRole.SAFETY_OFFICER,
    CosRole.TENANT_ADMIN,
  )
  @ApiOperation({ summary: 'Update issue — applies FIELD_LEVEL_MERGE conflict strategy' })
  @ApiParam({ name: 'issueId', type: 'string', format: 'uuid' })
  updateIssue(@Param('issueId') issueId: string, @Body() dto: UpdateIssueDto) {
    return this.svc.updateIssue(issueId, dto);
  }

  // GET /api/v1/issues
  @Get('issues')
  @Roles(
    CosRole.SITE_WORKER,
    CosRole.SITE_ENGINEER,
    CosRole.PROJECT_MANAGER,
    CosRole.EXECUTIVE,
    CosRole.SAFETY_OFFICER,
    CosRole.TENANT_ADMIN,
  )
  @ApiOperation({ summary: 'List issues (filterable by severity, status, project)' })
  @ApiQuery({ name: 'project_id', required: false, type: String })
  @ApiQuery({ name: 'severity', required: false, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listIssues(
    @Query('project_id') project_id?: string,
    @Query('severity') severity?: string,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.listIssues({
      project_id,
      severity,
      status,
      page: Math.max(1, parseInt(page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
    });
  }

  // ── Inspections ───────────────────────────────────────────────────────────

  // POST /api/v1/inspections
  @Post('inspections')
  @Roles(CosRole.SITE_ENGINEER, CosRole.SAFETY_OFFICER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Submit inspection result against a safety checklist' })
  submitInspection(@Body() dto: SubmitInspectionDto) {
    return this.svc.submitInspection(dto);
  }

  // ── Material Consumptions ─────────────────────────────────────────────────

  // POST /api/v1/site-reports/:reportId/materials
  @Post('site-reports/:reportId/materials')
  @Roles(CosRole.SITE_WORKER, CosRole.SITE_ENGINEER, CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({
    summary: 'Log material consumption against a site report; emits site.material.consumed.v1',
  })
  @ApiParam({ name: 'reportId', type: 'string', format: 'uuid' })
  createMaterialConsumption(
    @Param('reportId') reportId: string,
    @Body() dto: CreateMaterialConsumptionDto,
  ) {
    return this.svc.createMaterialConsumption(reportId, dto);
  }

  // ── Conflict Records ──────────────────────────────────────────────────────

  // GET /api/v1/conflict-records
  @Get('conflict-records')
  @Roles(CosRole.SITE_ENGINEER, CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'List unresolved conflict records for manual review' })
  listConflictRecords() {
    return this.svc.listConflictRecords();
  }

  // PATCH /api/v1/conflict-records/:conflictId/resolve
  @Patch('conflict-records/:conflictId/resolve')
  @Roles(CosRole.SITE_ENGINEER, CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark conflict record as manually resolved' })
  @ApiParam({ name: 'conflictId', type: 'string', format: 'uuid' })
  resolveConflict(@Param('conflictId') conflictId: string, @Body() _dto: ResolveConflictDto) {
    return this.svc.resolveConflict(conflictId);
  }
}
