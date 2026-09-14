import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { AssignDedicatedDbDto } from './dto/assign-dedicated-db.dto';
import { MarkContractedDto } from './dto/mark-contracted.dto';
import { AdminJustificationDto } from './dto/admin-justification.dto';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { TenantRequest } from './tenant.middleware';

// Every mutation below carries a `justification` (§6.7, product-owner decision 2026-09-14) and is
// audited by TenantService inside its own transaction. The request DTOs enforce the reason's presence
// and length; the service makes an unauditable action fail.
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

  @Get('provisioning')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(CosRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary: 'Provisioning-run state of every ENTERPRISE tenant that has one (SYSTEM_ADMIN only)',
  })
  async listProvisioning() {
    return this.tenantService.listProvisioning();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(CosRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Provision a new tenant (SYSTEM_ADMIN only)' })
  async create(@Body() dto: CreateTenantDto, @Req() req: TenantRequest) {
    return this.tenantService.createTenant(dto, req.userId ?? 'system', dto.justification);
  }

  @Patch(':tenantId/dedicated-db')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(CosRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Assign dedicated DB URL to a tenant (SYSTEM_ADMIN only)' })
  async assignDedicatedDb(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: AssignDedicatedDbDto,
    @Req() req: TenantRequest,
  ) {
    await this.tenantService.assignDedicatedDb(
      tenantId,
      dto.dedicatedDbUrl,
      req.userId ?? 'system',
      dto.justification,
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
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: MarkContractedDto,
    @Req() req: TenantRequest,
  ) {
    const result = await this.tenantService.markAsEnterpriseContracted(
      tenantId,
      dto.contractReference,
      req.userId ?? 'system',
      dto.justification,
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
  async deactivate(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: AdminJustificationDto,
    @Req() req: TenantRequest,
  ) {
    await this.tenantService.deactivateTenant(tenantId, req.userId ?? 'system', dto.justification);
    return { message: 'Tenant deactivated' };
  }

  // §34.5 — "SYSTEM_ADMIN sends signal via Admin Panel or API". 404 no run · 409 not at the gate ·
  // 503 state unreadable. See TenantService.decideProvisioning.
  @Post(':tenantId/provisioning/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(CosRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary: 'Approve a provisioning run waiting at the data-migration gate (SYSTEM_ADMIN only)',
  })
  async approveProvisioning(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: AdminJustificationDto,
    @Req() req: TenantRequest,
  ) {
    return this.tenantService.decideProvisioning(
      tenantId,
      'approve',
      req.userId ?? 'system',
      dto.justification,
    );
  }

  @Post(':tenantId/provisioning/abort')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(CosRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary:
      'Abort a provisioning run waiting at the data-migration gate — compensates (SYSTEM_ADMIN only)',
  })
  async abortProvisioning(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: AdminJustificationDto,
    @Req() req: TenantRequest,
  ) {
    return this.tenantService.decideProvisioning(
      tenantId,
      'abort',
      req.userId ?? 'system',
      dto.justification,
    );
  }
}
