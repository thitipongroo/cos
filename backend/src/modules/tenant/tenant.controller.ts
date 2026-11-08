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
import { CreateTrialTenantDto } from './dto/create-trial-tenant.dto';
import { ConvertTenantDto } from './dto/convert-tenant.dto';
import { AssignDedicatedDbDto } from './dto/assign-dedicated-db.dto';
import { MarkContractedDto } from './dto/mark-contracted.dto';
import { AdminJustificationDto } from './public/admin-justification.dto';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { TenantRequest } from './tenant.middleware';
import { BootstrapTenantAdminDto } from './dto/bootstrap-tenant-admin.dto';
import {
  BOOTSTRAP_ADMIN_FLAG,
  TenantAdminBootstrapService,
} from './tenant-admin-bootstrap.service';
import { FeatureFlag } from '../../shared/feature-flags/feature-flag.decorator';

// Every mutation below carries a `justification` (§6.7, product-owner decision 2026-09-14) and is
// audited by TenantService inside its own transaction. The request DTOs enforce the reason's presence
// and length; the service makes an unauditable action fail.
@ApiTags('tenants')
@ApiBearerAuth()
@Controller('admin/tenants')
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly tenantAdmins: TenantAdminBootstrapService,
  ) {}

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

  // §7.10 — opened by sales for a construction-os.io trial request; ENTERPRISE is refused by the DTO.
  @Post('trial')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(CosRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Open a 30-day free-trial tenant (SYSTEM_ADMIN only)' })
  async createTrial(@Body() dto: CreateTrialTenantDto, @Req() req: TenantRequest) {
    const { justification, ...trial } = dto;
    return this.tenantService.createTrialTenant(trial, req.userId ?? 'system', justification);
  }

  // §7.10 — 404 unknown tenant · 409 COS-PLAN-004 already ACTIVE · 409 COS-PLAN-002 plan below usage.
  @Patch(':tenantId/convert')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(CosRole.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Convert a trial tenant to a paid plan (SYSTEM_ADMIN only)' })
  async convert(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: ConvertTenantDto,
    @Req() req: TenantRequest,
  ) {
    return this.tenantService.convertTenant(
      tenantId,
      dto.planType,
      req.userId ?? 'system',
      dto.justification,
    );
  }

  // ADR-110 — the first TENANT_ADMIN of a tenant that has none. 404 unknown tenant · 400 inactive ·
  // 409 COS-TADM-001 the tenant already has an administrator · 409 identity exists · 503 COS-FLAG-001 flag off.
  @Post(':tenantId/tenant-admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(CosRole.SYSTEM_ADMIN)
  @FeatureFlag(BOOTSTRAP_ADMIN_FLAG)
  @ApiOperation({
    summary:
      "Create a tenant's first TENANT_ADMIN and email a 72-hour invitation (SYSTEM_ADMIN only)",
  })
  async bootstrapAdmin(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: BootstrapTenantAdminDto,
    @Req() req: TenantRequest,
  ) {
    return this.tenantAdmins.bootstrap(
      tenantId,
      { email: dto.email, display_name: dto.display_name },
      req.userId ?? 'system',
      dto.justification,
    );
  }

  // 409 COS-TADM-002 unless the tenant's only administrator has never signed in.
  @Post(':tenantId/tenant-admin/invite')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(CosRole.SYSTEM_ADMIN)
  @FeatureFlag(BOOTSTRAP_ADMIN_FLAG)
  @ApiOperation({
    summary: "Resend the first TENANT_ADMIN's invitation while it is unused (SYSTEM_ADMIN only)",
  })
  async resendAdminInvite(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: AdminJustificationDto,
    @Req() req: TenantRequest,
  ) {
    return this.tenantAdmins.resendInvite(tenantId, req.userId ?? 'system', dto.justification);
  }

  // ADR-110 round 2 — withdraw an unused invitation (a mistyped address). 409 COS-TADM-003 otherwise.
  @Post(':tenantId/tenant-admin/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(CosRole.SYSTEM_ADMIN)
  @FeatureFlag(BOOTSTRAP_ADMIN_FLAG)
  @ApiOperation({
    summary: "Cancel the first TENANT_ADMIN's unused invitation (SYSTEM_ADMIN only)",
  })
  async cancelAdminInvite(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: AdminJustificationDto,
    @Req() req: TenantRequest,
  ) {
    return this.tenantAdmins.cancelInvite(tenantId, req.userId ?? 'system', dto.justification);
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
