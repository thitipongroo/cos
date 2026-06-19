// Tenant Settings Controller — Phase 2 (§20.7.8, ADR-028)
// TENANT_ADMIN reads/updates their own tenant's configurable settings.

import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { TenantSettingsService } from './settings.service';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';

@ApiTags('tenant-settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(CosRole.TENANT_ADMIN)
@Controller('tenant/settings')
export class TenantSettingsController {
  constructor(private readonly svc: TenantSettingsService) {}

  // GET /api/v1/tenant/settings
  @Get()
  @ApiOperation({ summary: 'Get the current tenant settings (TENANT_ADMIN only)' })
  get() {
    return this.svc.getSettings();
  }

  // PATCH /api/v1/tenant/settings
  @Patch()
  @ApiOperation({ summary: 'Update tenant settings (partial; TENANT_ADMIN only)' })
  update(@Body() dto: UpdateTenantSettingsDto) {
    return this.svc.updateSettings(dto);
  }
}
