import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { AnalyticsService } from './analytics.service';
import { AnalyticsProjectScopeService } from './analytics-project-scope.service';
import { resolveDateRange, resolveTenantId, TenantRequest } from './analytics.request';

// 06-rbac-permission-matrix §6.4 "Intelligence Layer" — Executive dashboard:
//   Executive FULL · PM R · Site Engineer — · Procurement — · Finance R · Safety — · CRM — · Admin FULL
// The endpoint previously mounted JwtAuthGuard alone, so a SITE_WORKER, VIEWER, PROCUREMENT_OFFICER
// or SAFETY_OFFICER — every one of them a `—` in that row — could read tenant-wide budget
// utilisation, cost variance and overdue-invoice totals.
const EXECUTIVE_DASHBOARD_ROLES = [
  CosRole.EXECUTIVE,
  CosRole.PROJECT_MANAGER,
  CosRole.FINANCE,
  CosRole.TENANT_ADMIN,
] as const;

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('analytics')
export class AnalyticsExecutiveController {
  constructor(
    private readonly svc: AnalyticsService,
    private readonly scope: AnalyticsProjectScopeService,
  ) {}

  // GET /api/v1/analytics/executive?projectIds[]=...&dateRange=2026-01-01,2026-06-30&tenantId=...
  @Get('executive')
  @Roles(...EXECUTIVE_DASHBOARD_ROLES)
  @ApiOperation({
    summary:
      'Executive dashboard — budget utilization, at-risk projects, overdue invoices ' +
      '(ROLE: Executive, PM, Finance, Tenant Admin)',
  })
  @ApiQuery({ name: 'projectIds', type: [String], isArray: true })
  @ApiQuery({
    name: 'dateRange',
    type: String,
    required: false,
    description: 'YYYY-MM-DD,YYYY-MM-DD',
  })
  @ApiQuery({
    name: 'riskThresholdPct',
    type: Number,
    required: false,
    description: 'Variance % to flag as at-risk (default 10)',
  })
  async getExecutiveDashboard(
    @Req() req: TenantRequest,
    @Query('projectIds') projectIds: string | string[],
    @Query('dateRange') dateRange?: string,
    @Query('riskThresholdPct') riskThresholdPct?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    const ids = Array.isArray(projectIds) ? projectIds : projectIds ? [projectIds] : [];
    const threshold = riskThresholdPct !== undefined ? parseFloat(riskThresholdPct) : 10;
    // RBAC said the caller may open this dashboard; ABAC (§6.5) decides which projects they see
    // inside it. `projectIds` is raw query input, so a PM could otherwise name any project in the
    // tenant. Roles that are not project-scoped pass through unchanged.
    const scopedIds = await this.scope.filterVisibleProjectIds(ids);
    return this.svc.getExecutiveDashboard(
      resolveTenantId(req, tenantId),
      scopedIds,
      resolveDateRange(dateRange),
      threshold,
    );
  }
}
