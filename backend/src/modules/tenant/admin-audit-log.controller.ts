import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { TenantRequest } from './tenant.middleware';
import { AdminAuditLogService, AuditLogExport, AuditLogFilters } from './admin-audit-log.service';
import { AuditLogExportDto, AuditLogListDto, AuditLogSummaryDto } from './dto/audit-log-query.dto';
import { toAuditLogCsv } from './audit-log-csv.util';
import { setExportHeaders } from './tenant-audit-log.controller';

function filtersOf(query: AuditLogExportDto | AuditLogListDto): AuditLogFilters {
  return {
    tenantId: query.tenantId,
    actorId: query.actorId,
    action: query.action,
    from: query.from,
    to: query.to,
    q: query.q,
  };
}

// R17.6 — the cross-tenant audit trail for the Global Audit Log page (product-owner decision D4).
//
// In the tenant module, beside TenantAuditLogController, rather than a module of its own: both read the
// one table TenantService writes for SYSTEM_ADMIN actions, share one service and one row shape, and
// are only as cross-tenant as the tenant module already is. A separate module would own nothing.
//
// Every route is audited. With a `tenantId` filter the audit row is recorded against that tenant; with
// none it is recorded against the caller's own tenant (req.tenantId), filters in metadata.
@ApiTags('audit-logs')
@ApiBearerAuth()
@Controller('admin/audit-logs')
export class AdminAuditLogController {
  constructor(private readonly auditLogs: AdminAuditLogService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(CosRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary:
      'One page of the audit log across all tenants, filtered — the read is audited (SYSTEM_ADMIN only)',
  })
  async list(@Query() query: AuditLogListDto, @Req() req: TenantRequest) {
    return this.auditLogs.listAuditLogs(req.tenantId ?? '', req.userId ?? '', {
      ...filtersOf(query),
      cursor: query.cursor,
      limit: query.limit,
    });
  }

  @Get('summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(CosRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary:
      'Counts for the Global Audit Log cards: total, today, with_justification, privileged, privileged_7d — ' +
      'definitions on AdminAuditLogService.summarizeAuditLogs (SYSTEM_ADMIN only)',
  })
  async summary(@Query() query: AuditLogSummaryDto, @Req() req: TenantRequest) {
    return this.auditLogs.summarizeAuditLogs(req.tenantId ?? '', req.userId ?? '', {
      from: query.from,
      to: query.to,
    });
  }

  @Get('export')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(CosRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary:
      'The filtered audit log as CSV or JSON, capped at 50 000 rows — audited (SYSTEM_ADMIN only)',
  })
  async export(
    @Query() query: AuditLogExportDto,
    @Req() req: TenantRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string | AuditLogExport> {
    const format = query.format ?? 'csv';
    const exported = await this.auditLogs.exportAuditLogs(
      req.tenantId ?? '',
      req.userId ?? '',
      filtersOf(query),
      format,
    );
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === 'json') {
      setExportHeaders(res, 'application/json; charset=utf-8', `audit-log-${stamp}.json`, exported);
      return exported;
    }
    setExportHeaders(res, 'text/csv; charset=utf-8', `audit-log-${stamp}.csv`, exported);
    return toAuditLogCsv(exported.rows);
  }
}
