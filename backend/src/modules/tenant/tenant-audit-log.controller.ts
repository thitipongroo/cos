import { Controller, Get, Param, ParseUUIDPipe, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { TenantRequest } from './tenant.middleware';
import { AdminAuditLogService } from './admin-audit-log.service';
import { AuditLogPageDto, AuditLogSearchDto } from './dto/audit-log-query.dto';
import { toAuditLogCsv } from './audit-log-csv.util';

/**
 * Set on every audit-log export. `X-Export-Truncated: true` means more rows matched than
 * `X-Export-Row-Cap` and the file holds the newest of them — a CSV has nowhere else to say so.
 */
export function setExportHeaders(
  res: Response,
  contentType: string,
  filename: string,
  exported: { row_cap: number; truncated: boolean },
): void {
  res.header('Content-Type', contentType);
  res.header('Content-Disposition', `attachment; filename="${filename}"`);
  res.header('X-Export-Row-Cap', String(exported.row_cap));
  res.header('X-Export-Truncated', String(exported.truncated));
}

// R17.4 — one tenant's audit trail for the SYSTEM_ADMIN panel (§20.4.6, product-owner decision D3).
// Both routes are READS that are themselves audited (`audit.read`, `audit.export`) against the tenant
// in the path; see AdminAuditLogService for the transaction and for how RLS is handled.
@ApiTags('tenants')
@ApiBearerAuth()
@Controller('admin/tenants/:tenantId/audit-logs')
export class TenantAuditLogController {
  constructor(private readonly auditLogs: AdminAuditLogService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(CosRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary:
      "One page of a tenant's audit log, newest first — the read is audited (SYSTEM_ADMIN only)",
  })
  async list(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Query() query: AuditLogPageDto,
    @Req() req: TenantRequest,
  ) {
    return this.auditLogs.listTenantAuditLogs(tenantId, req.userId ?? '', {
      cursor: query.cursor,
      limit: query.limit,
      q: query.q,
    });
  }

  @Get('export.csv')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(CosRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary:
      "A tenant's audit log as CSV, capped at 50 000 rows — the export is audited (SYSTEM_ADMIN only)",
  })
  async exportCsv(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Query() query: AuditLogSearchDto,
    @Req() req: TenantRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const exported = await this.auditLogs.exportTenantAuditLogs(tenantId, req.userId ?? '', {
      q: query.q,
    });
    setExportHeaders(res, 'text/csv; charset=utf-8', `audit-log-${tenantId}.csv`, exported);
    return toAuditLogCsv(exported.rows);
  }
}
