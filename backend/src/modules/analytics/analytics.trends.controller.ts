import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

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
  @ApiQuery({ name: 'dateRange', type: String, description: 'YYYY-MM-DD,YYYY-MM-DD' })
  @ApiQuery({ name: 'tenantId', type: String })
  getCostTrend(
    @Param('projectId') projectId: string,
    @Query('tenantId') tenantId: string,
    @Query('dateRange') dateRange: string,
  ) {
    return this.svc.getCostTrend(tenantId, projectId, dateRange);
  }

  // GET /api/v1/analytics/projects/:projectId/procurement-trend
  @Get('procurement-trend')
  @ApiOperation({ summary: 'Project procurement trend — daily PO, RFQ, invoice activity' })
  @ApiParam({ name: 'projectId', type: String })
  @ApiQuery({ name: 'dateRange', type: String, description: 'YYYY-MM-DD,YYYY-MM-DD' })
  @ApiQuery({ name: 'tenantId', type: String })
  getProcurementTrend(
    @Param('projectId') projectId: string,
    @Query('tenantId') tenantId: string,
    @Query('dateRange') dateRange: string,
  ) {
    return this.svc.getProcurementTrend(tenantId, projectId, dateRange);
  }

  // GET /api/v1/analytics/projects/:projectId/site-trend
  @Get('site-trend')
  @ApiOperation({ summary: 'Project site trend — daily manpower, issues, inspections' })
  @ApiParam({ name: 'projectId', type: String })
  @ApiQuery({ name: 'dateRange', type: String, description: 'YYYY-MM-DD,YYYY-MM-DD' })
  @ApiQuery({ name: 'tenantId', type: String })
  getSiteTrend(
    @Param('projectId') projectId: string,
    @Query('tenantId') tenantId: string,
    @Query('dateRange') dateRange: string,
  ) {
    return this.svc.getSiteTrend(tenantId, projectId, dateRange);
  }
}
