import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';
import { resolveDateRange, resolveTenantId, TenantRequest } from './analytics.request';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics/projects/:projectId')
export class AnalyticsTrendsController {
  constructor(private readonly svc: AnalyticsService) {}

  // GET /api/v1/analytics/projects/:projectId/cost-trend
  @Get('cost-trend')
  @ApiOperation({ summary: 'Project cost trend — daily committed vs actual amounts' })
  @ApiParam({ name: 'projectId', type: String })
  @ApiQuery({
    name: 'dateRange',
    type: String,
    required: false,
    description: 'YYYY-MM-DD,YYYY-MM-DD',
  })
  getCostTrend(
    @Req() req: TenantRequest,
    @Param('projectId') projectId: string,
    @Query('dateRange') dateRange?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.svc.getCostTrend(
      resolveTenantId(req, tenantId),
      projectId,
      resolveDateRange(dateRange),
    );
  }

  // GET /api/v1/analytics/projects/:projectId/procurement-trend
  @Get('procurement-trend')
  @ApiOperation({ summary: 'Project procurement trend — daily PO, RFQ, invoice activity' })
  @ApiParam({ name: 'projectId', type: String })
  @ApiQuery({
    name: 'dateRange',
    type: String,
    required: false,
    description: 'YYYY-MM-DD,YYYY-MM-DD',
  })
  getProcurementTrend(
    @Req() req: TenantRequest,
    @Param('projectId') projectId: string,
    @Query('dateRange') dateRange?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.svc.getProcurementTrend(
      resolveTenantId(req, tenantId),
      projectId,
      resolveDateRange(dateRange),
    );
  }

  // GET /api/v1/analytics/projects/:projectId/site-trend
  @Get('site-trend')
  @ApiOperation({ summary: 'Project site trend — daily manpower, issues, inspections' })
  @ApiParam({ name: 'projectId', type: String })
  @ApiQuery({
    name: 'dateRange',
    type: String,
    required: false,
    description: 'YYYY-MM-DD,YYYY-MM-DD',
  })
  getSiteTrend(
    @Req() req: TenantRequest,
    @Param('projectId') projectId: string,
    @Query('dateRange') dateRange?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.svc.getSiteTrend(
      resolveTenantId(req, tenantId),
      projectId,
      resolveDateRange(dateRange),
    );
  }
}
