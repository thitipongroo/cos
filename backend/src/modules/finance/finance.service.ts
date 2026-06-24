// Finance Service — Phase 7
// Project cost tracking: budget, cost transactions, payments, variance reporting.
// Consumes procurement Kafka events; no direct DB access to procurement schema.
// All monetary calculations via decimal.js (ROUND_HALF_UP).

import {
  Injectable,
  Scope,
  Inject,
  NotFoundException,
  UnprocessableEntityException,
  ForbiddenException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { Decimal, sumDecimals } from '@cos/financial';
import { KafkaProducer } from '@cos/shared';
import { createLogger } from '@cos/logger';
import { FinanceRepository } from './finance.repository';
import type {
  ProjectBudgetRow,
  BudgetLineRow,
  CostTransactionRow,
  PaymentRow,
  CustomerRow,
  ContractRow,
  BillingRow,
  ArReceiptRow,
  CashflowDueRow,
} from './finance.repository';
import type { CreateBudgetDto } from './dto/create-budget.dto';
import type { AddBudgetLineDto } from './dto/add-budget-line.dto';
import type { RecordPaymentDto } from './dto/record-payment.dto';
import type {
  CreateCustomerDto,
  CreateContractDto,
  CreateBillingDto,
  RecordArReceiptDto,
} from './dto/ar-billing.dto';

const logger = createLogger('finance-service');
const DEFAULT_VARIANCE_THRESHOLD = new Decimal('10');

// §15: PM approves Client Billing (AR) up to a configured limit; above requires Executive.
// Default in THB, tenant-configurable in Phase 14 admin UI (mirrors procurement thresholds).
const DEFAULT_BILLING_PM_APPROVAL_MAX = new Decimal(
  process.env['BILLING_PM_APPROVAL_MAX'] ?? '500000',
);

// Direct-method cash flow forecast: weekly buckets (industry-standard 13-week rolling horizon).
const FORECAST_WEEKS = 13;
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** One period bucket in a direct-method cash flow forecast. */
export interface CashflowPeriod {
  period_start: string;
  period_end: string;
  inflow: string;
  outflow: string;
  net_flow: string;
  cumulative_net: string;
}

@Injectable({ scope: Scope.REQUEST })
export class FinanceService {
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? '';
  }
  private get userId(): string {
    return (this.request as { userId?: string }).userId ?? '';
  }
  private readonly correlationId: string;
  private readonly kafka: KafkaProducer;

  constructor(
    private readonly repo: FinanceRepository,
    @Inject(REQUEST)
    private readonly request: Request & { tenantId?: string; user?: { user_id?: string } },
  ) {
    this.correlationId = randomUUID();
    this.kafka = new KafkaProducer();
  }

  // ── Budget Management ─────────────────────────────────────────────────────

  async createOrUpdateBudget(project_id: string, dto: CreateBudgetDto): Promise<ProjectBudgetRow> {
    const threshold = dto.variance_alert_threshold
      ? new Decimal(dto.variance_alert_threshold).toFixed(2)
      : DEFAULT_VARIANCE_THRESHOLD.toFixed(2);

    const budget = await this.repo.upsertBudget({
      project_id,
      total_budget_amount: new Decimal(dto.total_budget_amount).toFixed(4),
      total_budget_currency: dto.total_budget_currency,
      variance_alert_threshold: threshold,
    });

    await this.emitEvent('finance.budget.created.v1', {
      project_id,
      budget_id: budget.budget_id,
      total_budget_amount: budget.total_budget_amount,
      total_budget_currency: budget.total_budget_currency,
    });

    logger.info(
      { project_id, budget_id: budget.budget_id, tenant_id: this.tenantId },
      'budget.created',
    );
    return budget;
  }

  async getBudgetSummary(project_id: string): Promise<{
    budget: ProjectBudgetRow;
    lines: BudgetLineRow[];
    variance_percentage: string;
  }> {
    const budget = await this.repo.findBudgetByProject(project_id);
    if (!budget) throw new NotFoundException(`No budget found for project ${project_id}`);
    const lines = await this.repo.findLinesByBudget(budget.budget_id);

    const allocated = new Decimal(budget.allocated_amount);
    const actual = new Decimal(budget.actual_amount);
    const committed = new Decimal(budget.committed_amount);

    const variance_percentage = allocated.isZero()
      ? '0.0000'
      : actual.plus(committed).minus(allocated).dividedBy(allocated).times(100).toFixed(4);

    return { budget, lines, variance_percentage };
  }

  // ── Budget Lines ──────────────────────────────────────────────────────────

  async addBudgetLine(project_id: string, dto: AddBudgetLineDto): Promise<BudgetLineRow> {
    const budget = await this.repo.findBudgetByProject(project_id);
    if (!budget) throw new NotFoundException(`No budget found for project ${project_id}`);

    const line = await this.repo.addBudgetLine({
      budget_id: budget.budget_id,
      project_id,
      line_name: dto.line_name,
      allocated_amount: new Decimal(dto.allocated_amount).toFixed(4),
      currency_code: dto.currency_code,
      boq_category_id: dto.boq_category_id ?? null,
    });

    await this.recalculateAllocated(budget.budget_id, project_id);
    logger.info(
      { project_id, line_id: line.line_id, tenant_id: this.tenantId },
      'budget_line.added',
    );
    return line;
  }

  // ── Cost Transactions ─────────────────────────────────────────────────────

  async listCostTransactions(params: {
    project_id?: string;
    page: number;
    limit: number;
  }): Promise<{ items: CostTransactionRow[]; total: number; page: number; limit: number }> {
    const { rows, total } = await this.repo.findCostTransactions(params);
    return { items: rows, total, page: params.page, limit: params.limit };
  }

  // ── Kafka Consumer Handlers ────────────────────────────────────────────────
  // Called by FinanceConsumer when procurement events arrive.

  /** procurement.po.created → record COMMITTED cost transaction */
  async handlePoCreated(event: {
    po_id: string;
    project_id: string;
    tenant_id: string;
    total_amount: { amount: string; currency_code: string };
  }): Promise<void> {
    await this.repo.createTransaction({
      project_id: event.project_id,
      source_type: 'PURCHASE_ORDER',
      source_id: event.po_id,
      amount: new Decimal(event.total_amount.amount).toFixed(4),
      currency_code: event.total_amount.currency_code,
      transaction_date: new Date().toISOString().slice(0, 10),
      description: `PO committed: ${event.po_id}`,
      recorded_by: null,
    });
    await this.recalculateAndCheckVariance(event.project_id);
    logger.info({ po_id: event.po_id, project_id: event.project_id }, 'cost_transaction.committed');
  }

  /** procurement.invoice.received → record ACTUAL cost transaction */
  async handleInvoiceReceived(event: {
    po_id: string;
    invoice_id: string;
    project_id: string;
    tenant_id: string;
    amount: { amount: string; currency_code: string };
  }): Promise<void> {
    await this.repo.createTransaction({
      project_id: event.project_id,
      source_type: 'INVOICE',
      source_id: event.invoice_id,
      amount: new Decimal(event.amount.amount).toFixed(4),
      currency_code: event.amount.currency_code,
      transaction_date: new Date().toISOString().slice(0, 10),
      description: `Invoice actual: ${event.invoice_id}`,
      recorded_by: null,
    });
    await this.recalculateAndCheckVariance(event.project_id);
    logger.info(
      { invoice_id: event.invoice_id, project_id: event.project_id },
      'cost_transaction.actual',
    );
  }

  /** procurement.po.status_changed → remove committed if PO CANCELLED */
  async handlePoStatusChanged(event: {
    po_id: string;
    project_id: string;
    tenant_id: string;
    from_status: string;
    to_status: string;
  }): Promise<void> {
    if (event.to_status === 'CANCELLED' || event.to_status === 'REJECTED') {
      await this.repo.deleteTransactionBySource(event.po_id);
      await this.recalculateAndCheckVariance(event.project_id);
      logger.info(
        { po_id: event.po_id, project_id: event.project_id },
        'cost_transaction.removed_on_cancel',
      );
    }
  }

  // ── Payments ──────────────────────────────────────────────────────────────

  async recordPayment(dto: RecordPaymentDto): Promise<PaymentRow> {
    const project_id = dto.project_id;
    const payment = await this.repo.createPayment({
      invoice_id: dto.invoice_id,
      project_id,
      amount: new Decimal(dto.amount).toFixed(4),
      currency_code: dto.currency_code,
      payment_date: dto.payment_date,
      payment_reference: dto.payment_reference ?? null,
      recorded_by: this.userId,
    });

    await this.emitEvent('finance.payment.processed.v1', {
      project_id,
      payment_id: payment.payment_id,
      invoice_id: dto.invoice_id,
      amount: payment.amount,
      currency_code: payment.currency_code,
      payment_date: dto.payment_date,
    });

    logger.info(
      { payment_id: payment.payment_id, project_id, tenant_id: this.tenantId },
      'payment.processed',
    );
    return payment;
  }

  async listPayments(params: {
    project_id?: string;
    page: number;
    limit: number;
  }): Promise<{ items: PaymentRow[]; total: number; page: number; limit: number }> {
    const { rows, total } = await this.repo.findPayments(params);
    return { items: rows, total, page: params.page, limit: params.limit };
  }

  // Approve a PENDING payment (FINANCE). 422 if the payment is missing or not PENDING.
  async approvePayment(paymentId: string): Promise<PaymentRow> {
    const updated = await this.repo.approvePayment(paymentId);
    if (!updated) {
      throw new UnprocessableEntityException(
        `Payment ${paymentId} not found or not in PENDING status`,
      );
    }
    return updated;
  }

  // ── Variance Report ───────────────────────────────────────────────────────

  async getVarianceReport(): Promise<
    Array<{
      project_id: string;
      budget_id: string;
      allocated: string;
      committed: string;
      actual: string;
      variance_percentage: string;
      over_budget: boolean;
    }>
  > {
    const budgets = await this.repo.findAllBudgets();
    return budgets.map((b) => {
      const allocated = new Decimal(b.allocated_amount);
      const committed = new Decimal(b.committed_amount);
      const actual = new Decimal(b.actual_amount);
      const variance_percentage = allocated.isZero()
        ? '0.0000'
        : actual.plus(committed).minus(allocated).dividedBy(allocated).times(100).toFixed(4);
      return {
        project_id: b.project_id,
        budget_id: b.budget_id,
        allocated: b.allocated_amount,
        committed: b.committed_amount,
        actual: b.actual_amount,
        variance_percentage,
        over_budget: new Decimal(variance_percentage).greaterThan(b.variance_alert_threshold),
      };
    });
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  private async recalculateAllocated(budget_id: string, project_id: string): Promise<void> {
    const lines = await this.repo.findLinesByBudget(budget_id);
    const allocated = sumDecimals(lines.map((l) => new Decimal(l.allocated_amount)));
    const budget = await this.repo.findBudgetByProject(project_id);
    if (!budget) return;
    await this.repo.updateBudgetAggregates({
      budget_id,
      committed_amount: budget.committed_amount,
      actual_amount: budget.actual_amount,
      allocated_amount: allocated.toFixed(4),
    });
  }

  private async recalculateAndCheckVariance(project_id: string): Promise<void> {
    const budget = await this.repo.findBudgetByProject(project_id);
    if (!budget) return;

    const { committed_total, actual_total } = await this.repo.sumTransactionsByProject(project_id);

    const committed = new Decimal(committed_total);
    const actual = new Decimal(actual_total);
    const allocated = new Decimal(budget.allocated_amount);

    await this.repo.updateBudgetAggregates({
      budget_id: budget.budget_id,
      committed_amount: committed.toFixed(4),
      actual_amount: actual.toFixed(4),
      allocated_amount: budget.allocated_amount,
    });

    if (!allocated.isZero()) {
      const variance_pct = actual.plus(committed).minus(allocated).dividedBy(allocated).times(100);
      const threshold = new Decimal(budget.variance_alert_threshold);
      if (variance_pct.greaterThan(threshold)) {
        await this.emitEvent('finance.variance.alert.v1', {
          project_id,
          budget_id: budget.budget_id,
          variance_percentage: variance_pct.toFixed(4),
          threshold_exceeded: threshold.toFixed(2),
          actual_amount: actual.toFixed(4),
          committed_amount: committed.toFixed(4),
          allocated_amount: allocated.toFixed(4),
          currency_code: budget.total_budget_currency,
        });
        logger.warn(
          { project_id, variance_pct: variance_pct.toFixed(4) },
          'finance.variance.alert',
        );
      }
    }
  }

  // ── Customers (§11) ─────────────────────────────────────────────────────────

  async createCustomer(dto: CreateCustomerDto): Promise<CustomerRow> {
    return this.repo.createCustomer({
      company_name: dto.company_name,
      customer_type: dto.customer_type ?? null,
      opportunity_id: dto.opportunity_id ?? null,
    });
  }

  async listCustomers(): Promise<CustomerRow[]> {
    return this.repo.listCustomers();
  }

  // ── Contracts (§11) ─────────────────────────────────────────────────────────

  async createContract(dto: CreateContractDto): Promise<ContractRow> {
    return this.repo.createContract({
      project_id: dto.project_id,
      contract_type: dto.contract_type,
      contract_value: dto.contract_value ? new Decimal(dto.contract_value).toFixed(4) : null,
      customer_id: dto.customer_id ?? null,
      vendor_id: dto.vendor_id ?? null,
    });
  }

  async listContracts(project_id?: string): Promise<ContractRow[]> {
    return this.repo.listContracts(project_id);
  }

  // ── Client Billing (AR — §11, §15) ──────────────────────────────────────────

  async createBilling(dto: CreateBillingDto): Promise<BillingRow> {
    const contract = await this.repo.findContractById(dto.contract_id);
    if (!contract) {
      throw new NotFoundException(`Contract ${dto.contract_id} not found`);
    }
    return this.repo.createBilling({
      project_id: dto.project_id,
      contract_id: dto.contract_id,
      billing_number: dto.billing_number,
      amount: new Decimal(dto.amount).toFixed(4),
      due_date: dto.due_date,
    });
  }

  async getBilling(billing_id: string): Promise<BillingRow> {
    const billing = await this.repo.findBillingById(billing_id);
    if (!billing) {
      throw new NotFoundException(`Billing ${billing_id} not found`);
    }
    return billing;
  }

  async listBillings(params: {
    project_id?: string;
    status?: string;
    page: number;
    limit: number;
  }): Promise<{ items: BillingRow[]; total: number; page: number; limit: number }> {
    const { rows, total } = await this.repo.listBillings(params);
    return { items: rows, total, page: params.page, limit: params.limit };
  }

  /** Approve a DRAFT billing → ISSUED (§15: PM up to limit, Executive above). */
  async approveBilling(
    billing_id: string,
    tier: 'PM' | 'EXECUTIVE' | 'TENANT_ADMIN',
  ): Promise<BillingRow> {
    const billing = await this.getBilling(billing_id);
    if (billing.status !== 'DRAFT') {
      throw new UnprocessableEntityException(
        `Billing ${billing_id} is ${billing.status}; only DRAFT can be approved`,
      );
    }
    if (tier === 'PM' && new Decimal(billing.amount).greaterThan(DEFAULT_BILLING_PM_APPROVAL_MAX)) {
      throw new ForbiddenException(
        'Billing amount exceeds PM approval limit; Executive approval required',
      );
    }
    const updated = await this.repo.updateBillingStatus({
      billing_id,
      status: 'ISSUED',
      approved_by: this.userId,
    });
    await this.emitEvent('finance.billing.approved.v1', {
      billing_id,
      project_id: updated.project_id,
      contract_id: updated.contract_id,
      amount: updated.amount,
      approved_by: this.userId,
      tier,
    });
    logger.info({ billing_id, tier, tenant_id: this.tenantId }, 'billing.approved');
    return updated;
  }

  // ── AR Receipts (§11) ───────────────────────────────────────────────────────

  /** Record a client payment; settles the parent billing (ISSUED → PAID). */
  async recordArReceipt(dto: RecordArReceiptDto): Promise<ArReceiptRow> {
    const billing = await this.getBilling(dto.billing_id);
    if (billing.status !== 'ISSUED') {
      throw new UnprocessableEntityException(
        `Billing ${dto.billing_id} is ${billing.status}; a receipt can only settle an ISSUED billing`,
      );
    }
    const receipt = await this.repo.createArReceipt({
      project_id: dto.project_id,
      billing_id: dto.billing_id,
      customer_id: dto.customer_id,
      amount_received: new Decimal(dto.amount_received).toFixed(4),
      received_date: dto.received_date,
      payment_method: dto.payment_method ?? null,
      payment_reference: dto.payment_reference ?? null,
      received_by: this.userId,
    });
    await this.repo.updateBillingStatus({ billing_id: dto.billing_id, status: 'PAID' });
    await this.emitEvent('finance.ar_receipt.recorded.v1', {
      ar_receipt_id: receipt.ar_receipt_id,
      billing_id: dto.billing_id,
      project_id: dto.project_id,
      amount_received: receipt.amount_received,
    });
    logger.info(
      {
        ar_receipt_id: receipt.ar_receipt_id,
        billing_id: dto.billing_id,
        tenant_id: this.tenantId,
      },
      'ar_receipt.recorded',
    );
    return receipt;
  }

  // ── Cash flow forecast (direct method, §09) ─────────────────────────────────

  /** 13-week rolling direct-method forecast: AR inflow (ISSUED billings) − AP outflow
   *  (PENDING payments), bucketed weekly by due date. Cumulative net is relative to 0
   *  (no opening cash-account balance is modeled — not in §11). */
  async getCashflowForecast(project_id: string): Promise<CashflowPeriod[]> {
    const [inflows, outflows] = await Promise.all([
      this.repo.findUnpaidBillingsDue(project_id),
      this.repo.findPendingPaymentsDue(project_id),
    ]);
    return this.buildForecast(inflows, outflows);
  }

  private buildForecast(inflows: CashflowDueRow[], outflows: CashflowDueRow[]): CashflowPeriod[] {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const startMs = start.getTime();

    const inflowByBucket = Array.from({ length: FORECAST_WEEKS }, () => new Decimal(0));
    const outflowByBucket = Array.from({ length: FORECAST_WEEKS }, () => new Decimal(0));

    const bucketIndex = (due: Date): number => {
      const dueMs = due.getTime();
      if (dueMs < startMs) return 0; // overdue collapses into the first bucket
      return Math.floor((dueMs - startMs) / MS_PER_WEEK);
    };

    for (const row of inflows) {
      const idx = bucketIndex(row.due_date);
      if (idx < FORECAST_WEEKS) inflowByBucket[idx] = inflowByBucket[idx]!.plus(row.amount);
    }
    for (const row of outflows) {
      const idx = bucketIndex(row.due_date);
      if (idx < FORECAST_WEEKS) outflowByBucket[idx] = outflowByBucket[idx]!.plus(row.amount);
    }

    let cumulative = new Decimal(0);
    const periods: CashflowPeriod[] = [];
    for (let i = 0; i < FORECAST_WEEKS; i++) {
      const inflow = inflowByBucket[i]!;
      const outflow = outflowByBucket[i]!;
      const net = inflow.minus(outflow);
      cumulative = cumulative.plus(net);
      periods.push({
        period_start: new Date(startMs + i * MS_PER_WEEK).toISOString().slice(0, 10),
        period_end: new Date(startMs + (i + 1) * MS_PER_WEEK).toISOString().slice(0, 10),
        inflow: inflow.toFixed(4),
        outflow: outflow.toFixed(4),
        net_flow: net.toFixed(4),
        cumulative_net: cumulative.toFixed(4),
      });
    }
    return periods;
  }

  private async emitEvent<T>(eventType: string, payload: T): Promise<void> {
    try {
      await this.kafka.connect();
      await this.kafka.publish({
        event_type: eventType,
        event_version: '1.0',
        tenant_id: this.tenantId,
        actor_id: this.userId,
        occurred_at: new Date().toISOString(),
        correlation_id: this.correlationId,
        payload,
      });
    } catch (err) {
      logger.error(
        { event_type: eventType, err, correlation_id: this.correlationId },
        'kafka.publish.failed',
      );
    } finally {
      await this.kafka.disconnect().catch(/* istanbul ignore next */ () => undefined);
    }
  }
}
