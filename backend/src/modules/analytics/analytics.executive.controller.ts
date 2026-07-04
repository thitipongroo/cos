import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';
import { resolveDateRange, resolveTenantId, TenantRequest } from './analytics.request';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsExecutiveController {
  constructor(private readonly svc: AnalyticsService) {}

  // GET /api/v1/analytics/executive?projectIds[]=...&dateRange=2026-01-01,2026-06-30&tenantId=...
  @Get('executive')
  @ApiOperation({
    summary: 'Executive dashboard — budget utilization, at-risk projects, overdue invoices',
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
  getExecutiveDashboard(
    @Req() req: TenantRequest,
    @Query('projectIds') projectIds: string | string[],
    @Query('dateRange') dateRange?: string,
    @Query('riskThresholdPct') riskThresholdPct?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    const ids = Array.isArray(projectIds) ? projectIds : projectIds ? [projectIds] : [];
    const threshold = riskThresholdPct !== undefined ? parseFloat(riskThresholdPct) : 10;
    return this.svc.getExecutiveDashboard(
      resolveTenantId(req, tenantId),
      ids,
      resolveDateRange(dateRange),
      threshold,
    );
  }
}
