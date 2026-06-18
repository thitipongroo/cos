// Finance Controller — Phase 7
// Canonical path convention (spec §14 Financial APIs + ADR-023): finance resources are
// served under /api/v1/finance/*. Budget is project-scoped (/finance/budget/:projectId);
// cost-transactions and payments are tenant-wide AIP-132 lists filterable by ?project_id=.
// RBAC: read = FINANCE, PROJECT_MANAGER, EXECUTIVE, TENANT_ADMIN; write = FINANCE, TENANT_ADMIN.

import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { FinanceService } from './finance.service';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { AddBudgetLineDto } from './dto/add-budget-line.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';

const READ_ROLES = [
  CosRole.FINANCE,
  CosRole.PROJECT_MANAGER,
  CosRole.EXECUTIVE,
  CosRole.TENANT_ADMIN,
] as const;

function parsePage(page: string): number {
  return Math.max(1, parseInt(page, 10) || 1);
}
function parseLimit(limit: string): number {
  return Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
}

@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class FinanceController {
  constructor(private readonly svc: FinanceService) {}

  // GET /api/v1/finance/budget/:projectId  (budget vs actual vs committed + lines)
  @Get('finance/budget/:projectId')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Budget summary with lines (budget vs actual vs committed)' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  getBudget(@Param('projectId') projectId: string) {
    return this.svc.getBudgetSummary(projectId);
  }

  // POST /api/v1/finance/budget/:projectId
  @Post('finance/budget/:projectId')
  @Roles(CosRole.FINANCE, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create or update project budget' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  createOrUpdateBudget(@Param('projectId') projectId: string, @Body() dto: CreateBudgetDto) {
    return this.svc.createOrUpdateBudget(projectId, dto);
  }

  // POST /api/v1/finance/budget/:projectId/lines
  @Post('finance/budget/:projectId/lines')
  @Roles(CosRole.FINANCE, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Add a budget line to project budget' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  addBudgetLine(@Param('projectId') projectId: string, @Body() dto: AddBudgetLineDto) {
    return this.svc.addBudgetLine(projectId, dto);
  }

  // GET /api/v1/finance/cost-transactions  (tenant-wide, AIP-132; ?project_id= to scope)
  @Get('finance/cost-transactions')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List cost transactions across the tenant (filterable by project)' })
  @ApiQuery({ name: 'project_id', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listTransactions(
    @Query('project_id') project_id?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.listCostTransactions({
      project_id,
      page: parsePage(page),
      limit: parseLimit(limit),
    });
  }

  // POST /api/v1/finance/payments  (record payment against a vendor invoice; project_id in body)
  @Post('finance/payments')
  @Roles(CosRole.FINANCE, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Record a payment against a vendor invoice' })
  recordPayment(@Body() dto: RecordPaymentDto) {
    return this.svc.recordPayment(dto);
  }

  // GET /api/v1/finance/payments  (tenant-wide AP payment queue, AIP-132; ?project_id= to scope)
  @Get('finance/payments')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List payments across the tenant (filterable by project)' })
  @ApiQuery({ name: 'project_id', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listPayments(
    @Query('project_id') project_id?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.listPayments({
      project_id,
      page: parsePage(page),
      limit: parseLimit(limit),
    });
  }

  // GET /api/v1/finance/reports/variance
  @Get('finance/reports/variance')
  @Roles(CosRole.FINANCE, CosRole.EXECUTIVE, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Budget variance report across all projects' })
  @HttpCode(HttpStatus.OK)
  getVarianceReport() {
    return this.svc.getVarianceReport();
  }
}
