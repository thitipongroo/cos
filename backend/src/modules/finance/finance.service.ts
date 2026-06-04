// Finance Service — Phase 7
// Project cost tracking: budget, cost transactions, payments, variance reporting.
// Consumes procurement Kafka events; no direct DB access to procurement schema.
// All monetary calculations via decimal.js (ROUND_HALF_UP).

import { Injectable, Scope, Inject, NotFoundException } from '@nestjs/common';
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
} from './finance.repository';
import type { CreateBudgetDto } from './dto/create-budget.dto';
import type { AddBudgetLineDto } from './dto/add-budget-line.dto';
import type { RecordPaymentDto } from './dto/record-payment.dto';

const logger = createLogger('finance-service');
const DEFAULT_VARIANCE_THRESHOLD = new Decimal('10');

@Injectable({ scope: Scope.REQUEST })
export class FinanceService {
  private readonly tenantId: string;
  private readonly userId: string;
  private readonly correlationId: string;
  private readonly kafka: KafkaProducer;

  constructor(
    private readonly repo: FinanceRepository,
    @Inject(REQUEST)
    request: Request & { tenantId?: string; user?: { user_id?: string } },
  ) {
    this.tenantId = request.tenantId ?? '';
    this.userId = request.user?.user_id ?? '';
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

  async listCostTransactions(
    project_id: string,
    page: number,
    limit: number,
  ): Promise<{ items: CostTransactionRow[]; total: number }> {
    const { rows, total } = await this.repo.findTransactionsByProject(project_id, page, limit);
    return { items: rows, total };
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

  async recordPayment(project_id: string, dto: RecordPaymentDto): Promise<PaymentRow> {
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

  async listPayments(project_id: string): Promise<PaymentRow[]> {
    return this.repo.findPaymentsByProject(project_id);
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
