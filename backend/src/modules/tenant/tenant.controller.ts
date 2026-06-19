import { Controller, Get, Post, Body, Param, Patch, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { AssignDedicatedDbDto } from './dto/assign-dedicated-db.dto';
import { MarkContractedDto } from './dto/mark-contracted.dto';
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

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(CosRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'List all tenants on the platform (SYSTEM_ADMIN only)' })
  async list() {
    return this.tenantService.listTenants();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(CosRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Provision a new tenant (SYSTEM_ADMIN only)' })
  async create(@Body() dto: CreateTenantDto, @Req() req: TenantRequest) {
    return this.tenantService.createTenant(dto, req.userId ?? 'system');
  }

  @Patch(':tenantId/dedicated-db')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(CosRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Assign dedicated DB URL to a tenant (SYSTEM_ADMIN only)' })
  async assignDedicatedDb(
    @Param('tenantId') tenantId: string,
    @Body() dto: AssignDedicatedDbDto,
    @Req() req: TenantRequest,
  ) {
    await this.tenantService.assignDedicatedDb(
      tenantId,
      dto.dedicatedDbUrl,
      req.userId ?? 'system',
    );
    return { message: 'Dedicated DB assigned' };
  }

  @Patch(':tenantId/mark-contracted')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(CosRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary:
      'Mark Enterprise tenant as contracted — starts provisioning workflow (SYSTEM_ADMIN only)',
  })
  async markContracted(
    @Param('tenantId') tenantId: string,
    @Body() dto: MarkContractedDto,
    @Req() req: TenantRequest,
  ) {
    const result = await this.tenantService.markAsEnterpriseContracted(
      tenantId,
      dto.contractReference,
      req.userId ?? 'system',
    );
    return {
      message: 'Enterprise provisioning workflow started',
      workflowId: result.workflowId,
      tenantId,
    };
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
