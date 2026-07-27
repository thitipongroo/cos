// My-Tenant Controller — the signed-in user reading their OWN tenant identity (name + code + plan).
//
// Separate from TenantController (@Controller('admin/tenants'), SYSTEM_ADMIN cross-tenant panel): this
// is self-service — any authenticated role in the tenant, scoped by the JWT's tenant_id, so a caller
// can only ever read their own tenant. Powers the Tenant Admin settings screen's Organization Info.

import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { TenantService } from './tenant.service';
import type { TenantRequest } from './tenant.middleware';

@ApiTags('tenant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tenant')
export class MyTenantController {
  constructor(private readonly tenantService: TenantService) {}

  // GET /api/v1/tenant
  @Get()
  @ApiOperation({
    summary: "The signed-in user's own tenant — name, code, plan (any authenticated role)",
  })
  @ApiResponse({ status: 200, description: 'tenant_name, tenant_code, plan_type' })
  async myTenant(@Req() req: TenantRequest) {
    return this.tenantService.getMyTenant(req.tenantId!);
  }
}
