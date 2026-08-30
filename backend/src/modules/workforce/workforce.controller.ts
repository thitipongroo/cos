// Workforce Controller — Phase 22

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import type { TenantRequest } from '../../shared/context/tenant-request';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { WorkforceService } from './workforce.service';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { AllocateWorkerDto } from './dto/allocate-worker.dto';
import { RecordAttendanceDto } from './dto/attendance.dto';
import { SubmitTimesheetDto } from './dto/timesheet.dto';
import { clsUserId } from '../../shared/context/cls-context';

// Roles per 14-api-architecture §Workforce APIs ("PM, Site Engineer" on every write route, "Any role"
// on the reads). TENANT_ADMIN is added because 06-rbac-permission-matrix §6.4 grants it FULL on the
// Workforce attendance module, and §6.3 defines FULL as "full access including configuration".
//
// These were previously documented in @ApiOperation summaries but never enforced: the controllers
// mounted JwtAuthGuard alone, with no RolesGuard, so every authenticated tenant user — including
// SITE_WORKER, whose matrix entry for Workforce attendance is R — could register workers, record
// attendance for anyone, and approve timesheets.
//
// A read route carries no @Roles decorator: RolesGuard allows when no metadata is present, which is
// exactly "Any role" and keeps the existing behaviour of those endpoints unchanged.
const WORKFORCE_WRITE_ROLES = [
  CosRole.PROJECT_MANAGER,
  CosRole.SITE_ENGINEER,
  CosRole.TENANT_ADMIN,
] as const;

// §14 narrows approval specifically to Site Engineer — a tighter authority than the write routes.
const TIMESHEET_APPROVE_ROLES = [CosRole.SITE_ENGINEER, CosRole.TENANT_ADMIN] as const;

@ApiTags('Workforce')
@ApiBearerAuth()
// 'workers' (NOT 'api/v1/workers') — the app already sets a global 'api/v1' prefix, so the
// redundant prefix here would double to /api/v1/api/v1/workers. Fixed for the check-in endpoints.
// KNOWN ISSUE: the sibling ProjectWorkforce/Timesheet controllers (and equipment/vendor/rfqs) still
// carry the redundant 'api/v1' prefix — flagged for a separate cleanup.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('workers')
export class WorkerController {
  constructor(private readonly service: WorkforceService) {}

  @Post()
  @Roles(...WORKFORCE_WRITE_ROLES)
  @ApiOperation({ summary: 'Create worker (ROLE: PM, Site Engineer, Tenant Admin)' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateWorkerDto) {
    return this.service.createWorker(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List workers (tenant-scoped)' })
  list() {
    return this.service.listWorkers();
  }

  // NOTE: must precede @Get(':id') so 'me' is not parsed as a UUID id.
  @Get('me')
  @ApiOperation({ summary: 'Resolve the worker linked to the current user (self check-in)' })
  getMyWorker(@Req() req: TenantRequest) {
    // req.userId is set by TenantContextInterceptor on most paths; under Fastify it may be absent, so
    // fall back to CLS (populated by JwtAuthGuard). See shared/context/cls-context.ts.
    return this.service.getMyWorker(req.userId ?? clsUserId());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get worker detail' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getWorker(id);
  }

  @Post(':id/attendance')
  @Roles(...WORKFORCE_WRITE_ROLES)
  @ApiOperation({ summary: 'Record check-in / check-out (ROLE: PM, Site Engineer, Tenant Admin)' })
  @HttpCode(HttpStatus.CREATED)
  recordAttendance(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordAttendanceDto) {
    return this.service.recordAttendance(id, dto);
  }

  @Get(':id/attendance')
  @ApiOperation({ summary: 'Attendance history (date range)' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  getAttendance(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.getAttendanceHistory(id, from, to);
  }
}

@ApiTags('Workforce')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('projects/:projectId/workforce')
export class ProjectWorkforceController {
  constructor(private readonly service: WorkforceService) {}

  @Post()
  @Roles(...WORKFORCE_WRITE_ROLES)
  @ApiOperation({ summary: 'Allocate worker to project (ROLE: PM, Site Engineer, Tenant Admin)' })
  @HttpCode(HttpStatus.CREATED)
  allocate(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: AllocateWorkerDto) {
    return this.service.allocateToProject(projectId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List project workforce' })
  list(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.service.getProjectWorkforce(projectId);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Manpower summary for analytics' })
  summary(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.service.getManpowerSummary(projectId);
  }

  // Deliberately NO @Roles: like the two reads above, RolesGuard allows a route with no metadata,
  // which is what lets a SITE_WORKER open their own crew's directory (mockup 04_directory). Writes
  // on this controller stay behind WORKFORCE_WRITE_ROLES. The payload is name / trade / phone /
  // on-site — contact details of colleagues on a project the caller's tenant owns, and tenant
  // isolation is RLS (ADR-008); it carries no rate, no employment terms and no identity documents.
  @Get('directory')
  @ApiOperation({ summary: "Project crew as a contact list, with today's on-site state" })
  directory(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.service.getProjectDirectory(projectId);
  }
}

@ApiTags('Workforce')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('timesheets')
export class TimesheetController {
  constructor(private readonly service: WorkforceService) {}

  @Post()
  @Roles(...WORKFORCE_WRITE_ROLES)
  @ApiOperation({ summary: 'Submit timesheet (ROLE: PM, Site Engineer, Tenant Admin)' })
  @HttpCode(HttpStatus.CREATED)
  submit(@Body() dto: SubmitTimesheetDto) {
    return this.service.submitTimesheet(dto);
  }

  @Patch(':id/approve')
  @Roles(...TIMESHEET_APPROVE_ROLES)
  @ApiOperation({ summary: 'Approve timesheet (ROLE: Site Engineer, Tenant Admin)' })
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.approveTimesheet(id);
  }
}
