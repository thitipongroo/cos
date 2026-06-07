// Finance Repository — Phase 7
// All DB access via TenantPrismaService (SET LOCAL app.current_tenant_id per request — ADR-008).
// Financial fields stored as DECIMAL(19,4); returned as string by Prisma.

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';

// ── Row types ──────────────────────────────────────────────────────────────

export interface ProjectBudgetRow {
  budget_id: string;
  project_id: string;
  tenant_id: string;
  total_budget_amount: string;
  total_budget_currency: string;
  allocated_amount: string;
  committed_amount: string;
  actual_amount: string;
  variance_alert_threshold: string;
  created_at: Date;
  updated_at: Date;
}

export interface BudgetLineRow {
  line_id: string;
  budget_id: string;
  project_id: string;
  tenant_id: string;
  boq_category_id: string | null;
  line_name: string;
  allocated_amount: string;
  currency_code: string;
  created_at: Date;
}

export interface CostTransactionRow {
  transaction_id: string;
  project_id: string;
  tenant_id: string;
  source_type: 'PURCHASE_ORDER' | 'INVOICE' | 'ADJUSTMENT';
  source_id: string;
  budget_line_id: string | null;
  amount: string;
  currency_code: string;
  transaction_date: Date;
  description: string | null;
  recorded_at: Date;
  recorded_by: string | null;
}

export interface PaymentRow {
  payment_id: string;
  invoice_id: string;
  project_id: string;
  tenant_id: string;
  amount: string;
  currency_code: string;
  payment_date: Date;
  payment_reference: string | null;
  wht_certificate_ref: string | null;
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
  recorded_by: string;
  created_at: Date;
}

export interface WhtRuleRow {
  rule_id: string;
  tenant_id: string;
  jurisdiction_code: string;
  service_type: string;
  rate: string; // DECIMAL returned as string by Prisma
  is_active: boolean;
}

// ── Repository ─────────────────────────────────────────────────────────────

@Injectable({ scope: Scope.REQUEST })
export class FinanceRepository {
  private readonly tenantId: string;

  constructor(
    private readonly db: TenantPrismaService,
    @Inject(REQUEST) request: Request & { tenantId?: string },
  ) {
    this.tenantId = request.tenantId ?? '';
  }

  // ── project_budgets ───────────────────────────────────────────────────────

  async upsertBudget(params: {
    project_id: string;
    total_budget_amount: string;
    total_budget_currency: string;
    variance_alert_threshold: string;
  }): Promise<ProjectBudgetRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<ProjectBudgetRow[]>`
        INSERT INTO finance.project_budgets
          (project_id, tenant_id, total_budget_amount, total_budget_currency, variance_alert_threshold)
        VALUES
          (${params.project_id}::uuid, ${this.tenantId}::uuid,
           ${params.total_budget_amount}::decimal, ${params.total_budget_currency},
           ${params.variance_alert_threshold}::decimal)
        ON CONFLICT (project_id) DO UPDATE SET
          total_budget_amount    = EXCLUDED.total_budget_amount,
          total_budget_currency  = EXCLUDED.total_budget_currency,
          variance_alert_threshold = EXCLUDED.variance_alert_threshold,
          updated_at             = now()
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async findBudgetByProject(project_id: string): Promise<ProjectBudgetRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<ProjectBudgetRow[]>`
        SELECT * FROM finance.project_budgets
        WHERE project_id = ${project_id}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  async updateBudgetAggregates(params: {
    budget_id: string;
    committed_amount: string;
    actual_amount: string;
    allocated_amount: string;
  }): Promise<void> {
    await this.db.run(
      (tx) =>
        tx.$executeRaw`
        UPDATE finance.project_budgets SET
          committed_amount = ${params.committed_amount}::decimal,
          actual_amount    = ${params.actual_amount}::decimal,
          allocated_amount = ${params.allocated_amount}::decimal,
          updated_at       = now()
        WHERE budget_id  = ${params.budget_id}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
      `,
    );
  }

  // ── budget_lines ──────────────────────────────────────────────────────────

  async addBudgetLine(params: {
    budget_id: string;
    project_id: string;
    line_name: string;
    allocated_amount: string;
    currency_code: string;
    boq_category_id?: string | null;
  }): Promise<BudgetLineRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<BudgetLineRow[]>`
        INSERT INTO finance.budget_lines
          (budget_id, project_id, tenant_id, line_name, allocated_amount, currency_code, boq_category_id)
        VALUES
          (${params.budget_id}::uuid, ${params.project_id}::uuid, ${this.tenantId}::uuid,
           ${params.line_name}, ${params.allocated_amount}::decimal, ${params.currency_code},
           ${params.boq_category_id ?? null}::uuid)
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async findLinesByBudget(budget_id: string): Promise<BudgetLineRow[]> {
    return this.db.run(
      (tx) =>
        tx.$queryRaw<BudgetLineRow[]>`
        SELECT * FROM finance.budget_lines
        WHERE budget_id = ${budget_id}::uuid
          AND tenant_id = ${this.tenantId}::uuid
        ORDER BY created_at
      `,
    );
  }

  // ── cost_transactions ─────────────────────────────────────────────────────

  async createTransaction(params: {
    project_id: string;
    source_type: CostTransactionRow['source_type'];
    source_id: string;
    amount: string;
    currency_code: string;
    transaction_date: string;
    description?: string | null;
    recorded_by?: string | null;
    budget_line_id?: string | null;
  }): Promise<CostTransactionRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<CostTransactionRow[]>`
        INSERT INTO finance.cost_transactions
          (project_id, tenant_id, source_type, source_id, amount, currency_code,
           transaction_date, description, recorded_by, budget_line_id)
        VALUES
          (${params.project_id}::uuid, ${this.tenantId}::uuid,
           ${params.source_type}::finance."CostSourceType",
           ${params.source_id}::uuid,
           ${params.amount}::decimal, ${params.currency_code},
           ${params.transaction_date}::date,
           ${params.description ?? null},
           ${params.recorded_by ?? null}::uuid,
           ${params.budget_line_id ?? null}::uuid)
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async findTransactionsByProject(
    project_id: string,
    page: number,
    limit: number,
  ): Promise<{ rows: CostTransactionRow[]; total: number }> {
    const offset = (page - 1) * limit;
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<CostTransactionRow[]>`
        SELECT * FROM finance.cost_transactions
        WHERE project_id = ${project_id}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
        ORDER BY transaction_date DESC, recorded_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
    );
    const countRows = await this.db.run(
      (tx) =>
        tx.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM finance.cost_transactions
        WHERE project_id = ${project_id}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
      `,
    );
    return { rows, total: Number(countRows[0]?.count ?? 0) };
  }

  async sumTransactionsByProject(project_id: string): Promise<{
    committed_total: string;
    actual_total: string;
  }> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<[{ committed_total: string; actual_total: string }]>`
        SELECT
          COALESCE(SUM(CASE WHEN source_type = 'PURCHASE_ORDER' THEN amount ELSE 0 END), 0)::text AS committed_total,
          COALESCE(SUM(CASE WHEN source_type = 'INVOICE'        THEN amount ELSE 0 END), 0)::text AS actual_total
        FROM finance.cost_transactions
        WHERE project_id = ${project_id}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
      `,
    );
    return rows[0] ?? { committed_total: '0', actual_total: '0' };
  }

  async deleteTransactionBySource(source_id: string): Promise<void> {
    await this.db.run(
      (tx) =>
        tx.$executeRaw`
        DELETE FROM finance.cost_transactions
        WHERE source_id = ${source_id}::uuid
          AND tenant_id = ${this.tenantId}::uuid
      `,
    );
  }

  // ── payments ──────────────────────────────────────────────────────────────

  async createPayment(params: {
    invoice_id: string;
    project_id: string;
    amount: string;
    currency_code: string;
    payment_date: string;
    payment_reference?: string | null;
    recorded_by: string;
  }): Promise<PaymentRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<PaymentRow[]>`
        INSERT INTO finance.payments
          (invoice_id, project_id, tenant_id, amount, currency_code,
           payment_date, payment_reference, recorded_by)
        VALUES
          (${params.invoice_id}::uuid, ${params.project_id}::uuid, ${this.tenantId}::uuid,
           ${params.amount}::decimal, ${params.currency_code},
           ${params.payment_date}::date,
           ${params.payment_reference ?? null},
           ${params.recorded_by}::uuid)
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async findPaymentsByProject(project_id: string): Promise<PaymentRow[]> {
    return this.db.run(
      (tx) =>
        tx.$queryRaw<PaymentRow[]>`
        SELECT * FROM finance.payments
        WHERE project_id = ${project_id}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
        ORDER BY payment_date DESC
      `,
    );
  }

  // ── wht_rules ─────────────────────────────────────────────────────────────

  async findWhtRule(jurisdiction_code: string, service_type: string): Promise<WhtRuleRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<WhtRuleRow[]>`
        SELECT * FROM finance.wht_rules
        WHERE tenant_id        = ${this.tenantId}::uuid
          AND jurisdiction_code = ${jurisdiction_code}
          AND service_type      = ${service_type}
          AND is_active         = true
        LIMIT 1
      `,
    );
    return rows[0] ?? null;
  }

  // ── variance report ───────────────────────────────────────────────────────

  async findAllBudgets(): Promise<ProjectBudgetRow[]> {
    return this.db.run(
      (tx) =>
        tx.$queryRaw<ProjectBudgetRow[]>`
        SELECT * FROM finance.project_budgets
        WHERE tenant_id = ${this.tenantId}::uuid
        ORDER BY created_at DESC
      `,
    );
  }
}
