// Finance Repository — Phase 7
// All DB access via TenantPrismaService (SET LOCAL app.current_tenant_id per request — ADR-008).
// Financial fields stored as DECIMAL(19,4); returned as string by Prisma.

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { OutboxPublisher } from '@cos/kafka';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';
import type { OutboxEventInput } from '../../shared/outbox/outbox.types';

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

// AR Billing increment (§11) ─────────────────────────────────────────────────

export interface CustomerRow {
  customer_id: string;
  tenant_id: string;
  opportunity_id: string | null;
  company_name: string;
  customer_type: string | null;
  status: string;
  created_at: Date;
}

export interface ContractRow {
  contract_id: string;
  tenant_id: string;
  project_id: string;
  contract_type: 'MAIN_CONTRACT' | 'SUBCONTRACT' | 'SUPPLY_AGREEMENT';
  contract_value: string | null;
  customer_id: string | null;
  vendor_id: string | null;
  status: string;
  created_at: Date;
}

export interface BillingRow {
  billing_id: string;
  tenant_id: string;
  project_id: string;
  contract_id: string;
  billing_number: string;
  amount: string;
  due_date: Date;
  status: 'DRAFT' | 'ISSUED' | 'PAID';
  issued_at: Date | null;
  approved_by: string | null;
  created_at: Date;
}

export interface ArReceiptRow {
  ar_receipt_id: string;
  tenant_id: string;
  project_id: string;
  billing_id: string;
  customer_id: string;
  amount_received: string;
  received_date: Date;
  payment_method: string | null;
  payment_reference: string | null;
  received_by: string;
  created_at: Date;
}

/** A dated amount feeding the direct-method cash flow forecast. */
export interface CashflowDueRow {
  due_date: Date;
  amount: string;
}

// ── Repository ─────────────────────────────────────────────────────────────

@Injectable({ scope: Scope.REQUEST })
export class FinanceRepository {
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? '';
  }

  constructor(
    private readonly db: TenantPrismaService,
    @Inject(REQUEST) private readonly request: Request & { tenantId?: string },
  ) {}

  // ── project_budgets ───────────────────────────────────────────────────────

  async upsertBudget(
    params: {
      project_id: string;
      total_budget_amount: string;
      total_budget_currency: string;
      variance_alert_threshold: string;
    },
    buildOutboxEvent?: (row: ProjectBudgetRow) => OutboxEventInput,
  ): Promise<ProjectBudgetRow> {
    const rows = await this.db.run(async (tx) => {
      const upserted = await tx.$queryRaw<ProjectBudgetRow[]>`
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
      `;
      // §35.13 ESC-13 — builder over the upserted row: budget_id is server-generated on first insert.
      if (buildOutboxEvent && upserted[0]) {
        await OutboxPublisher.write(tx, buildOutboxEvent(upserted[0]));
      }
      return upserted;
    });
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

  async updateBudgetAggregates(
    params: {
      budget_id: string;
      committed_amount: string;
      actual_amount: string;
      allocated_amount: string;
    },
    outboxEvent?: OutboxEventInput,
  ): Promise<void> {
    await this.db.run(async (tx) => {
      await tx.$executeRaw`
        UPDATE finance.project_budgets SET
          committed_amount = ${params.committed_amount}::decimal,
          actual_amount    = ${params.actual_amount}::decimal,
          allocated_amount = ${params.allocated_amount}::decimal,
          updated_at       = now()
        WHERE budget_id  = ${params.budget_id}::uuid
          AND tenant_id  = ${this.tenantId}::uuid
      `;
      // §35.13 ESC-13 — the variance alert is only emitted when the aggregates that triggered
      // it are actually persisted.
      if (outboxEvent) await OutboxPublisher.write(tx, outboxEvent);
    });
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

  // Tenant-wide cost transactions (AIP-132); optional project_id filter (spec §14).
  async findCostTransactions(params: {
    project_id?: string;
    page: number;
    limit: number;
  }): Promise<{ rows: CostTransactionRow[]; total: number }> {
    const offset = (params.page - 1) * params.limit;
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<CostTransactionRow[]>`
        SELECT * FROM finance.cost_transactions
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${params.project_id ?? null}::uuid IS NULL OR project_id = ${params.project_id ?? null}::uuid)
        ORDER BY transaction_date DESC, recorded_at DESC
        LIMIT ${params.limit} OFFSET ${offset}
      `,
    );
    const countRows = await this.db.run(
      (tx) =>
        tx.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM finance.cost_transactions
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${params.project_id ?? null}::uuid IS NULL OR project_id = ${params.project_id ?? null}::uuid)
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

  async createPayment(
    params: {
      invoice_id: string;
      project_id: string;
      amount: string;
      currency_code: string;
      payment_date: string;
      payment_reference?: string | null;
      recorded_by: string;
    },
    buildOutboxEvent?: (row: PaymentRow) => OutboxEventInput,
  ): Promise<PaymentRow> {
    const rows = await this.db.run(async (tx) => {
      const inserted = await tx.$queryRaw<PaymentRow[]>`
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
      `;
      // §35.13 ESC-13 — builder over the inserted row: payment_id is server-generated.
      if (buildOutboxEvent && inserted[0]) {
        await OutboxPublisher.write(tx, buildOutboxEvent(inserted[0]));
      }
      return inserted;
    });
    return rows[0]!;
  }

  // Approve a PENDING payment → PROCESSED. Returns null if not found / not pending (tenant-scoped).
  async approvePayment(paymentId: string): Promise<PaymentRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<PaymentRow[]>`
        UPDATE finance.payments
        SET status = 'PROCESSED'::finance."PaymentStatus"
        WHERE payment_id = ${paymentId}::uuid
          AND tenant_id = ${this.tenantId}::uuid
          AND status = 'PENDING'::finance."PaymentStatus"
        RETURNING *
      `,
    );
    return rows[0] ?? null;
  }

  // Tenant-wide payments (AIP-132 AP queue); optional project_id filter (spec §14).
  async findPayments(params: {
    project_id?: string;
    page: number;
    limit: number;
  }): Promise<{ rows: PaymentRow[]; total: number }> {
    const offset = (params.page - 1) * params.limit;
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<PaymentRow[]>`
        SELECT * FROM finance.payments
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${params.project_id ?? null}::uuid IS NULL OR project_id = ${params.project_id ?? null}::uuid)
        ORDER BY payment_date DESC
        LIMIT ${params.limit} OFFSET ${offset}
      `,
    );
    const countRows = await this.db.run(
      (tx) =>
        tx.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM finance.payments
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${params.project_id ?? null}::uuid IS NULL OR project_id = ${params.project_id ?? null}::uuid)
      `,
    );
    return { rows, total: Number(countRows[0]?.count ?? 0) };
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

  // ── customers (§11) ─────────────────────────────────────────────────────────

  async createCustomer(params: {
    company_name: string;
    customer_type?: string | null;
    opportunity_id?: string | null;
  }): Promise<CustomerRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<CustomerRow[]>`
        INSERT INTO finance.customers (tenant_id, opportunity_id, company_name, customer_type)
        VALUES (${this.tenantId}::uuid, ${params.opportunity_id ?? null}::uuid,
                ${params.company_name}, ${params.customer_type ?? null})
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async findCustomerById(customer_id: string): Promise<CustomerRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<CustomerRow[]>`
        SELECT * FROM finance.customers
        WHERE customer_id = ${customer_id}::uuid AND tenant_id = ${this.tenantId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  async listCustomers(): Promise<CustomerRow[]> {
    return this.db.run(
      (tx) =>
        tx.$queryRaw<CustomerRow[]>`
        SELECT * FROM finance.customers
        WHERE tenant_id = ${this.tenantId}::uuid
        ORDER BY created_at DESC
      `,
    );
  }

  // ── contracts (§11) ─────────────────────────────────────────────────────────

  async createContract(params: {
    project_id: string;
    contract_type: string;
    contract_value?: string | null;
    customer_id?: string | null;
    vendor_id?: string | null;
  }): Promise<ContractRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<ContractRow[]>`
        INSERT INTO finance.contracts
          (tenant_id, project_id, contract_type, contract_value, customer_id, vendor_id)
        VALUES
          (${this.tenantId}::uuid, ${params.project_id}::uuid,
           ${params.contract_type}::finance."ContractType",
           ${params.contract_value ?? null}::decimal,
           ${params.customer_id ?? null}::uuid, ${params.vendor_id ?? null}::uuid)
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async findContractById(contract_id: string): Promise<ContractRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<ContractRow[]>`
        SELECT * FROM finance.contracts
        WHERE contract_id = ${contract_id}::uuid AND tenant_id = ${this.tenantId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  async listContracts(project_id?: string): Promise<ContractRow[]> {
    return this.db.run(
      (tx) =>
        tx.$queryRaw<ContractRow[]>`
        SELECT * FROM finance.contracts
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${project_id ?? null}::uuid IS NULL OR project_id = ${project_id ?? null}::uuid)
        ORDER BY created_at DESC
      `,
    );
  }

  // ── billings (AR — §11) ───────────────────────────────────────────────────

  async createBilling(params: {
    project_id: string;
    contract_id: string;
    billing_number: string;
    amount: string;
    due_date: string;
  }): Promise<BillingRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<BillingRow[]>`
        INSERT INTO finance.billings
          (tenant_id, project_id, contract_id, billing_number, amount, due_date)
        VALUES
          (${this.tenantId}::uuid, ${params.project_id}::uuid, ${params.contract_id}::uuid,
           ${params.billing_number}, ${params.amount}::decimal, ${params.due_date}::date)
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  async findBillingById(billing_id: string): Promise<BillingRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<BillingRow[]>`
        SELECT * FROM finance.billings
        WHERE billing_id = ${billing_id}::uuid AND tenant_id = ${this.tenantId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  async listBillings(params: {
    project_id?: string;
    status?: string;
    page: number;
    limit: number;
  }): Promise<{ rows: BillingRow[]; total: number }> {
    const offset = (params.page - 1) * params.limit;
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<BillingRow[]>`
        SELECT * FROM finance.billings
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${params.project_id ?? null}::uuid IS NULL OR project_id = ${params.project_id ?? null}::uuid)
          AND (${params.status ?? null}::text IS NULL OR status = (${params.status ?? null})::finance."BillingStatus")
        ORDER BY due_date ASC
        LIMIT ${params.limit} OFFSET ${offset}
      `,
    );
    const countRows = await this.db.run(
      (tx) =>
        tx.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM finance.billings
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${params.project_id ?? null}::uuid IS NULL OR project_id = ${params.project_id ?? null}::uuid)
          AND (${params.status ?? null}::text IS NULL OR status = (${params.status ?? null})::finance."BillingStatus")
      `,
    );
    return { rows, total: Number(countRows[0]?.count ?? 0) };
  }

  /** DRAFT → ISSUED (approval, §15) or ISSUED → PAID (AR receipt recorded). */
  async updateBillingStatus(
    params: {
      billing_id: string;
      status: 'ISSUED' | 'PAID';
      approved_by?: string | null;
    },
    buildOutboxEvent?: (row: BillingRow) => OutboxEventInput,
  ): Promise<BillingRow> {
    const rows = await this.db.run(async (tx) => {
      const updated = await tx.$queryRaw<BillingRow[]>`
        UPDATE finance.billings SET
          status = ${params.status}::finance."BillingStatus",
          approved_by = COALESCE(${params.approved_by ?? null}::uuid, approved_by),
          issued_at = CASE WHEN ${params.status} = 'ISSUED' THEN now() ELSE issued_at END
        WHERE billing_id = ${params.billing_id}::uuid AND tenant_id = ${this.tenantId}::uuid
        RETURNING *
      `;
      // §35.13 ESC-13 — approveBilling derives its payload from the UPDATEd row; recordArReceipt
      // passes a constant builder because its ids are already known.
      if (buildOutboxEvent && updated[0]) {
        await OutboxPublisher.write(tx, buildOutboxEvent(updated[0]));
      }
      return updated;
    });
    return rows[0]!;
  }

  // ── ar_receipts (§11) ───────────────────────────────────────────────────────

  async createArReceipt(params: {
    project_id: string;
    billing_id: string;
    customer_id: string;
    amount_received: string;
    received_date: string;
    payment_method?: string | null;
    payment_reference?: string | null;
    received_by: string;
  }): Promise<ArReceiptRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<ArReceiptRow[]>`
        INSERT INTO finance.ar_receipts
          (tenant_id, project_id, billing_id, customer_id, amount_received,
           received_date, payment_method, payment_reference, received_by)
        VALUES
          (${this.tenantId}::uuid, ${params.project_id}::uuid, ${params.billing_id}::uuid,
           ${params.customer_id}::uuid, ${params.amount_received}::decimal,
           ${params.received_date}::date, ${params.payment_method ?? null},
           ${params.payment_reference ?? null}, ${params.received_by}::uuid)
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  // ── cash flow forecast sources (direct method) ──────────────────────────────

  /** Unpaid AR inflow: ISSUED billings by due_date (project-scoped). */
  async findUnpaidBillingsDue(project_id: string): Promise<CashflowDueRow[]> {
    return this.db.run(
      (tx) =>
        tx.$queryRaw<CashflowDueRow[]>`
        SELECT due_date, amount FROM finance.billings
        WHERE tenant_id = ${this.tenantId}::uuid
          AND project_id = ${project_id}::uuid
          AND status = 'ISSUED'
        ORDER BY due_date ASC
      `,
    );
  }

  /** Pending AP outflow: PENDING payments by payment_date (project-scoped). */
  async findPendingPaymentsDue(project_id: string): Promise<CashflowDueRow[]> {
    return this.db.run(
      (tx) =>
        tx.$queryRaw<CashflowDueRow[]>`
        SELECT payment_date AS due_date, amount FROM finance.payments
        WHERE tenant_id = ${this.tenantId}::uuid
          AND project_id = ${project_id}::uuid
          AND status = 'PENDING'
        ORDER BY payment_date ASC
      `,
    );
  }
}
