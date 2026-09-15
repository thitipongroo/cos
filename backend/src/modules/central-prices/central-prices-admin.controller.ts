// Central Prices admin API — SYSTEM_ADMIN only (ADR-061 §API and §RBAC; D8, D9).
//
//   GET  /api/v1/admin/central-prices               register: rows, total, next_cursor, periods
//   GET  /api/v1/admin/central-prices/sync-status   adapter + latest run / success / failure
//   GET  /api/v1/admin/central-prices/template.csv  the import header row
//   POST /api/v1/admin/central-prices/import        multipart: file + effective_period + justification
//   POST /api/v1/admin/central-prices/sync          run the CentralPriceAdapter once
//
// No PolicyGuard: like tenant.controller, these are platform routes a SYSTEM_ADMIN operates across
// tenants, and PolicyGuard's tenant_match exists for tenant-scoped routes. The two mutations carry a
// justification and are audited inside their own transaction by CentralPricesAdminService.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { clsTenantId, clsUserId } from '../../shared/context/cls-context';
import { AdminJustificationDto } from '../tenant/public/admin-justification.dto';
import { TEMPLATE_COLUMNS } from './central-price-rows';
import {
  readCentralPriceUpload,
  validateImportFields,
  type MultipartRequest,
} from './central-price-upload';
import { CentralPricesAdminService, type AdminCaller } from './central-prices-admin.service';
import type {
  CentralPriceListResponse,
  ImportResult,
  SyncRun,
  SyncStatusResponse,
} from './central-prices.types';
import { ListCentralPricesQueryDto } from './dto/central-price-query.dto';

/** What the auth layer leaves on the request. Under Fastify it may not reach here, hence the CLS fallback. */
interface AuthedRequest {
  userId?: string;
  tenantId?: string;
}

function callerOf(req: AuthedRequest): AdminCaller {
  return { actorId: req.userId || clsUserId(), tenantId: req.tenantId || clsTenantId() };
}

/** Header row only — a comment or example row would be imported as data. CRLF per RFC 4180. */
export const TEMPLATE_CSV = `${TEMPLATE_COLUMNS.join(',')}\r\n`;

@ApiTags('central-prices-admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(CosRole.SYSTEM_ADMIN)
@Controller('admin/central-prices')
export class CentralPricesAdminController {
  constructor(private readonly svc: CentralPricesAdminService) {}

  @Get()
  @ApiOperation({ summary: 'Browse the central price catalog, every status (SYSTEM_ADMIN only)' })
  list(@Query() query: ListCentralPricesQueryDto): Promise<CentralPriceListResponse> {
    return this.svc.list(query);
  }

  @Get('sync-status')
  @ApiOperation({
    summary: 'Adapter configuration and the latest import / sync runs (SYSTEM_ADMIN only)',
  })
  syncStatus(): Promise<SyncStatusResponse> {
    return this.svc.syncStatus();
  }

  @Get('template.csv')
  @ApiProduces('text/csv')
  @ApiOperation({
    summary: 'Download the import template — the header row only (SYSTEM_ADMIN only)',
  })
  template(@Res({ passthrough: true }) res: Response): string {
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', 'attachment; filename="central-prices-template.csv"');
    return TEMPLATE_CSV;
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'effective_period', 'justification'],
      properties: {
        file: { type: 'string', format: 'binary' },
        effective_period: { type: 'string' },
        source_ref: { type: 'string' },
        justification: { type: 'string', minLength: 10, maxLength: 500 },
      },
    },
  })
  @ApiOperation({
    summary:
      'Import a CSV or .xlsx price list for one effective_period (SYSTEM_ADMIN only, audited)',
  })
  async importFile(@Req() req: MultipartRequest & AuthedRequest): Promise<ImportResult> {
    const upload = await readCentralPriceUpload(req);
    const fields = await validateImportFields(upload.fields);
    return this.svc.importFile(callerOf(req), {
      justification: fields.justification,
      effective_period: fields.effective_period,
      source_ref: fields.source_ref ?? null,
      file: upload.file,
    });
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Run the government price adapter once and record the run (SYSTEM_ADMIN only, audited)',
  })
  sync(@Body() dto: AdminJustificationDto, @Req() req: AuthedRequest): Promise<SyncRun> {
    return this.svc.sync(callerOf(req), dto.justification);
  }
}
