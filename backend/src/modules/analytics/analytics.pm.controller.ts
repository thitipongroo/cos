import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';
import { resolveDateRange, resolveTenantId, TenantRequest } from './analytics.request';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsPmController {
  constructor(private readonly svc: AnalyticsService) {}

  // GET /api/v1/analytics/pm/:projectId?dateRange=...&tenantId=...
  @Get('pm/:projectId')
  @ApiOperation({
    summary: 'PM dashboard — manpower trend, open issues, inspection pass rate, procurement status',
  })
  @ApiParam({ name: 'projectId', type: String })
  @ApiQuery({
    name: 'dateRange',
    type: String,
    required: false,
    description: 'YYYY-MM-DD,YYYY-MM-DD',
  })
  getPmDashboard(
    @Req() req: TenantRequest,
    @Param('projectId') projectId: string,
    @Query('dateRange') dateRange?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.svc.getPmDashboard(
      resolveTenantId(req, tenantId),
      projectId,
      resolveDateRange(dateRange),
    );
  }
}
