// Finance Controller — Phase 7
// All endpoints require RBAC: FINANCE, PROJECT_MANAGER, EXECUTIVE, TENANT_ADMIN (read);
// FINANCE, TENANT_ADMIN (write).

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
  ParseIntPipe,
  DefaultValuePipe,
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

@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class FinanceController {
  constructor(private readonly svc: FinanceService) {}

  // GET /api/v1/projects/:projectId/finance/summary
  @Get('projects/:projectId/finance/summary')
  @Roles(CosRole.FINANCE, CosRole.PROJECT_MANAGER, CosRole.EXECUTIVE, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Budget vs actual vs committed summary' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  getSummary(@Param('projectId') projectId: string) {
    return this.svc.getBudgetSummary(projectId);
  }

  // GET /api/v1/projects/:projectId/finance/budget
  @Get('projects/:projectId/finance/budget')
  @Roles(CosRole.FINANCE, CosRole.PROJECT_MANAGER, CosRole.EXECUTIVE, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Budget detail with lines' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  getBudget(@Param('projectId') projectId: string) {
    return this.svc.getBudgetSummary(projectId);
  }

  // POST /api/v1/projects/:projectId/finance/budget
  @Post('projects/:projectId/finance/budget')
  @Roles(CosRole.FINANCE, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create or update project budget' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  createOrUpdateBudget(@Param('projectId') projectId: string, @Body() dto: CreateBudgetDto) {
    return this.svc.createOrUpdateBudget(projectId, dto);
  }

  // POST /api/v1/projects/:projectId/budget-lines
  @Post('projects/:projectId/budget-lines')
  @Roles(CosRole.FINANCE, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Add a budget line to project budget' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  addBudgetLine(@Param('projectId') projectId: string, @Body() dto: AddBudgetLineDto) {
    return this.svc.addBudgetLine(projectId, dto);
  }

  // GET /api/v1/projects/:projectId/cost-transactions
  @Get('projects/:projectId/cost-transactions')
  @Roles(CosRole.FINANCE, CosRole.PROJECT_MANAGER, CosRole.EXECUTIVE, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'List cost transactions for a project (paginated)' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listTransactions(
    @Param('projectId') projectId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.svc.listCostTransactions(
      projectId,
      Math.max(1, page),
      Math.min(100, Math.max(1, limit)),
    );
  }

  // POST /api/v1/projects/:projectId/payments
  @Post('projects/:projectId/payments')
  @Roles(CosRole.FINANCE, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'Record a payment against an invoice' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  recordPayment(@Param('projectId') projectId: string, @Body() dto: RecordPaymentDto) {
    return this.svc.recordPayment(projectId, dto);
  }

  // GET /api/v1/projects/:projectId/payments
  @Get('projects/:projectId/payments')
  @Roles(CosRole.FINANCE, CosRole.PROJECT_MANAGER, CosRole.EXECUTIVE, CosRole.TENANT_ADMIN)
  @ApiOperation({ summary: 'List payments for a project' })
  @ApiParam({ name: 'projectId', type: 'string', format: 'uuid' })
  listPayments(@Param('projectId') projectId: string) {
    return this.svc.listPayments(projectId);
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
