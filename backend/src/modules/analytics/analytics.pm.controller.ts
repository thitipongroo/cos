import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

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
  @ApiQuery({ name: 'dateRange', type: String, description: 'YYYY-MM-DD,YYYY-MM-DD' })
  @ApiQuery({ name: 'tenantId', type: String })
  getPmDashboard(
    @Param('projectId') projectId: string,
    @Query('tenantId') tenantId: string,
    @Query('dateRange') dateRange: string,
  ) {
    return this.svc.getPmDashboard(tenantId, projectId, dateRange);
  }
}
