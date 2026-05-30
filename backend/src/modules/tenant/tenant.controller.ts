import { Controller, Post, Body, Param, Patch, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { TenantRequest } from './tenant.middleware';

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('admin/tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(CosRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Provision a new tenant (SYSTEM_ADMIN only)' })
  async create(@Body() dto: CreateTenantDto, @Req() req: TenantRequest) {
    return this.tenantService.createTenant(dto, req.userId ?? 'system');
  }

  @Patch(':tenantId/deactivate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(CosRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Deactivate a tenant (SYSTEM_ADMIN only)' })
  async deactivate(@Param('tenantId') tenantId: string, @Req() req: TenantRequest) {
    await this.tenantService.deactivateTenant(tenantId, req.userId ?? 'system');
    return { message: 'Tenant deactivated' };
  }
}
