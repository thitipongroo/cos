// Central Prices tenant read — `GET /api/v1/central-prices` (ADR-061 §API: "lookup by code/description
// (tenant read)"; §RBAC: "all tenant roles are read-only").
//
// Guarded like the other tenant-readable reference data (master-data.controller): JwtAuthGuard,
// RolesGuard with every tenant role, PolicyGuard as defense-in-depth. SYSTEM_ADMIN is not listed — it has
// the register at /admin/central-prices, which also shows pending and inactive rows. Only ACTIVE rows
// (active and published) are returned; see CentralPriceCatalogService.

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { PolicyGuard } from '../../shared/guards/policy.guard';
import { CentralPriceCatalogService } from './central-price-catalog.service';
import type { CentralPriceSearchResponse } from './central-prices.types';
import { SearchCentralPricesQueryDto } from './dto/central-price-query.dto';

/** Every tenant role (§6.2 + §6.8) — the same set master-data grants its reads to. */
export const TENANT_READ_ROLES = [
  CosRole.TENANT_ADMIN,
  CosRole.EXECUTIVE,
  CosRole.PROJECT_MANAGER,
  CosRole.PROCUREMENT_OFFICER,
  CosRole.PROC_MANAGER,
  CosRole.FINANCE,
  CosRole.SAFETY_OFFICER,
  CosRole.SITE_ENGINEER,
  CosRole.SITE_WORKER,
  CosRole.CRM_SALES_MANAGER,
  CosRole.VIEWER,
];

@ApiTags('central-prices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PolicyGuard)
@Controller('central-prices')
export class CentralPricesController {
  constructor(private readonly catalog: CentralPriceCatalogService) {}

  @Get()
  @Roles(...TENANT_READ_ROLES)
  @ApiOperation({ summary: 'Look up active central prices by code or description (read-only)' })
  search(@Query() query: SearchCentralPricesQueryDto): Promise<CentralPriceSearchResponse> {
    return this.catalog.searchPublished(query);
  }
}
