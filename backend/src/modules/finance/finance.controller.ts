// Finance Controller — Phase 7
// Canonical path convention (spec §14 Financial APIs + ADR-023): finance resources are
// served under /api/v1/finance/*. Budget is project-scoped (/finance/budget/:projectId);
// cost-transactions and payments are tenant-wide AIP-132 lists filterable by ?project_id=.
// RBAC: read = FINANCE, PROJECT_MANAGER, EXECUTIVE, TENANT_ADMIN; write = FINANCE, TENANT_ADMIN.

import {
  Controller,
  Get,
  Post,
  Patch,
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
import {
  CreateCustomerDto,
  CreateContractDto,
  CreateBillingDto,
  ApproveBillingDto,
  RecordArReceiptDto,
} from './dto/ar-billing.dto';

const READ_ROLES = [
  CosRole.FINANCE,
  CosRole.PROJECT_MANAGER,
  CosRole.EXECUTIVE,
  CosRole.TENANT_ADMIN,
] as const;

// §06 RBAC (financial section): AR module role sets.
const BILLING_READ_ROLES = [
  CosRole.FINANCE,
  CosRole.PROJECT_MANAGER,
  CosRole.EXECUTIVE,
  CosRole.PROCUREMENT_OFFICER,
  CosRole.TENANT_ADMIN,
] as const;
const BILLING_APPROVE_ROLES = [
  CosRole.PROJECT_MANAGER,
  CosRole.EXECUTIVE,
  CosRole.TENANT_ADMIN,
] as const;
const PAYMENT_APPROVE_ROLES = [CosRole.FINANCE, CosRole.TENANT_ADMIN] as const;
const CONTRACT_WRITE_ROLES = [CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN] as const;
const CUSTOMER_WRITE_ROLES = [
  CosRole.FINANCE,
  CosRole.PROJECT_MANAGER,
  CosRole.CRM_SALES_MANAGER,
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

  @Patch('finance/payments/:paymentId/approve')
  @Roles(...PAYMENT_APPROVE_ROLES)
  @ApiOperation({ summary: 'Approve a pending payment (FINANCE) → PROCESSED' })
  @ApiParam({ name: 'paymentId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.OK)
  approvePayment(@Param('paymentId') paymentId: string) {
    return this.svc.approvePayment(paymentId);
  }

  // GET /api/v1/finance/reports/variance
  @Get('finance/reports/variance')
  @Roles(CosRole.FINANCE, CosRole.EXECUTIVE, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Budget variance report across all projects' })
  @HttpCode(HttpStatus.OK)
  getVarianceReport() {
    return this.svc.getVarianceReport();
  }

  // ── Customers (§11, CRM client for AR) ──────────────────────────────────────

  // POST /api/v1/finance/customers
  @Post('finance/customers')
  @Roles(...CUSTOMER_WRITE_ROLES)
  @ApiOperation({ summary: 'Register a client/customer' })
  createCustomer(@Body() dto: CreateCustomerDto) {
    return this.svc.createCustomer(dto);
  }

  // GET /api/v1/finance/customers
  @Get('finance/customers')
  @Roles(...BILLING_READ_ROLES)
  @ApiOperation({ summary: 'List customers' })
  listCustomers() {
    return this.svc.listCustomers();
  }

  // ── Contracts (§11) ─────────────────────────────────────────────────────────

  // POST /api/v1/finance/contracts
  @Post('finance/contracts')
  @Roles(...CONTRACT_WRITE_ROLES)
  @ApiOperation({ summary: 'Create a contract (client-side or vendor-side)' })
  createContract(@Body() dto: CreateContractDto) {
    return this.svc.createContract(dto);
  }

  // GET /api/v1/finance/contracts  (filterable by ?project_id=)
  @Get('finance/contracts')
  @Roles(...BILLING_READ_ROLES)
  @ApiOperation({ summary: 'List contracts (filterable by project)' })
  @ApiQuery({ name: 'project_id', required: false, type: String })
  listContracts(@Query('project_id') project_id?: string) {
    return this.svc.listContracts(project_id);
  }

  // ── Client Billing (AR — §11, §14, §15) ─────────────────────────────────────

  // POST /api/v1/finance/billing  (create AR billing — DRAFT)
  @Post('finance/billing')
  @Roles(CosRole.FINANCE, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create a client billing (AR) invoice in DRAFT' })
  createBilling(@Body() dto: CreateBillingDto) {
    return this.svc.createBilling(dto);
  }

  // GET /api/v1/finance/billing  (tenant-wide AR queue, AIP-132; ?project_id=&status=)
  @Get('finance/billing')
  @Roles(...BILLING_READ_ROLES)
  @ApiOperation({ summary: 'List client billings (filterable by project and status)' })
  @ApiQuery({ name: 'project_id', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['DRAFT', 'ISSUED', 'PAID'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listBillings(
    @Query('project_id') project_id?: string,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.svc.listBillings({
      project_id,
      status,
      page: parsePage(page),
      limit: parseLimit(limit),
    });
  }

  // GET /api/v1/finance/billing/:billingId
  @Get('finance/billing/:billingId')
  @Roles(...BILLING_READ_ROLES)
  @ApiOperation({ summary: 'Get a single client billing' })
  @ApiParam({ name: 'billingId', type: 'string', format: 'uuid' })
  getBilling(@Param('billingId') billingId: string) {
    return this.svc.getBilling(billingId);
  }

  // PATCH /api/v1/finance/billing/:billingId/approve  (DRAFT → ISSUED, §15)
  @Patch('finance/billing/:billingId/approve')
  @Roles(...BILLING_APPROVE_ROLES)
  @ApiOperation({ summary: 'Approve a client billing (PM up to limit; Executive above)' })
  @ApiParam({ name: 'billingId', type: 'string', format: 'uuid' })
  @HttpCode(HttpStatus.OK)
  approveBilling(@Param('billingId') billingId: string, @Body() dto: ApproveBillingDto) {
    return this.svc.approveBilling(billingId, dto.tier);
  }

  // ── AR Receipts (§11) ───────────────────────────────────────────────────────

  // POST /api/v1/finance/ar-receipts  (record client payment → billing PAID)
  @Post('finance/ar-receipts')
  @Roles(CosRole.FINANCE, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Record a client payment (AR receipt) against an ISSUED billing' })
  recordArReceipt(@Body() dto: RecordArReceiptDto) {
    return this.svc.recordArReceipt(dto);
  }

  // ── Cash flow forecast (direct method, §09/§14) ─────────────────────────────

  // GET /api/v1/finance/cashflow-forecast/:projectId
  @Get('finance/cashflow-forecast/:projectId')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: '13-week direct-method cash flow forecast for a project' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  getCashflowForecast(@Param('projectId') projectId: string) {
    return this.svc.getCashflowForecast(projectId);
  }
}
