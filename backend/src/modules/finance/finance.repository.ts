// Finance Repository — Phase 7
// All DB access via TenantPrismaService (SET LOCAL app.current_tenant_id per request — ADR-008).
// Financial fields stored as DECIMAL(19,4); returned as string by Prisma.

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';
import { applyCap, capLimit } from '../../shared/pagination/list-cap';
import { clsTenantId } from '../../shared/context/cls-context';

// Row types live in ./finance.rows; imported here for the method signatures below and re-exported so
// existing `from './finance.repository'` type imports (service, consumer, util, specs) keep resolving.
import type {
  ProjectBudgetRow,
  BudgetLineRow,
  CostTransactionRow,
  PaymentRow,
  WhtRuleRow,
  CustomerRow,
  ContractRow,
  BoqSnapshotItem,
  SignerParty,
  SignatureVerificationStatus,
  ContractSignatureRow,
  ContractSignTokenRow,
  BillingRow,
  ArReceiptRow,
  CashflowDueRow,
} from './finance.rows';

export type * from './finance.rows';

// ── Repository ─────────────────────────────────────────────────────────────

@Injectable({ scope: Scope.REQUEST })
export class FinanceRepository {
  // CLS fallback is load-bearing, not cosmetic: under Fastify the REQUEST injected into a
  // Scope.REQUEST provider is not guaranteed to be the object the auth layer decorated. The auth
  // guards publish tenant_id into CLS (the same source TenantPrismaService reads for RLS), so this
  // resolves even when the request copy does not carry it.
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? clsTenantId();
  }

  constructor(
    private readonly db: TenantPrismaService,
    @Inject(REQUEST) private readonly request: Request & { tenantId?: string },
  ) {}

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

  // Tenant-wide payments (AIP-132 AP queue); optional project_id + status filters (spec §14).
  //
  // `status` is filtered SERVER-SIDE for the same reason `/procurement/purchase-orders` and
  // `/finance/billing` already do it: a caller that wants a count of one status cannot get it by
  // filtering the page it happened to receive. This list paginates at 20 and the tenant holds
  // thirty-odd payments, so a client-side filter over page one is not a count — the defect the
  // Tenant-Admin dashboard's "Payments awaiting approval" tile hit. `total` is what a counter reads.
  //
  // Cast through the enum, not `::text`, mirroring the billing filter below: `status` is
  // `finance."PaymentStatus"`, so comparing it to a bare parameter has no operator. An unknown value
  // is rejected by Postgres as an invalid enum input rather than silently matching nothing.
  async findPayments(params: {
    project_id?: string;
    status?: string;
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
          AND (${params.status ?? null}::text IS NULL OR status = (${params.status ?? null})::finance."PaymentStatus")
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
          AND (${params.status ?? null}::text IS NULL OR status = (${params.status ?? null})::finance."PaymentStatus")
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
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<ProjectBudgetRow[]>`
        SELECT * FROM finance.project_budgets
        WHERE tenant_id = ${this.tenantId}::uuid
        ORDER BY created_at DESC
        LIMIT ${capLimit()}
      `,
    );
    return applyCap(rows, 'finance.project_budgets');
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
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<CustomerRow[]>`
        SELECT * FROM finance.customers
        WHERE tenant_id = ${this.tenantId}::uuid
        ORDER BY created_at DESC
        LIMIT ${capLimit()}
      `,
    );
    return applyCap(rows, 'finance.customers');
  }

  // ── contracts (§11) ─────────────────────────────────────────────────────────

  async createContract(params: {
    project_id: string;
    contract_type: string;
    contract_value?: string | null;
    customer_id?: string | null;
    vendor_id?: string | null;
    terms?: string | null;
  }): Promise<ContractRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<ContractRow[]>`
        INSERT INTO finance.contracts
          (tenant_id, project_id, contract_type, contract_value, customer_id, vendor_id, terms)
        VALUES
          (${this.tenantId}::uuid, ${params.project_id}::uuid,
           ${params.contract_type}::finance."ContractType",
           ${params.contract_value ?? null}::decimal,
           ${params.customer_id ?? null}::uuid, ${params.vendor_id ?? null}::uuid,
           ${params.terms ?? null}::text)
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
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<ContractRow[]>`
        SELECT * FROM finance.contracts
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${project_id ?? null}::uuid IS NULL OR project_id = ${project_id ?? null}::uuid)
        ORDER BY created_at DESC
        LIMIT ${capLimit()}
      `,
    );
    return applyCap(rows, 'finance.contracts');
  }

  /** Update a contract's lifecycle status; returns the updated row. */
  async updateContractStatus(contract_id: string, status: string): Promise<ContractRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<ContractRow[]>`
        UPDATE finance.contracts SET status = ${status}
         WHERE contract_id = ${contract_id}::uuid AND tenant_id = ${this.tenantId}::uuid
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  /** Bind an attached/generated document (File Service file_id) to a contract (ADR-058 CT-2). */
  async attachSignedDocument(
    contract_id: string,
    signed_document_id: string,
  ): Promise<ContractRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<ContractRow[]>`
        UPDATE finance.contracts
           SET signed_document_id = ${signed_document_id}::uuid
         WHERE contract_id = ${contract_id}::uuid AND tenant_id = ${this.tenantId}::uuid
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  /**
   * The ONE budget line a set of BOQ items all belong to, or null.
   *
   * `finance.budget_lines.boq_category_id` is the allocation dimension; the chain from a purchase
   * order is `po_line_items.boq_item_id` → `boq.boq_items.category_id` → that column. The PO event
   * carries the item ids (TDD OQ-50) so Finance does not have to ask Procurement — the one rule
   * Phase 7 is absolute about.
   *
   * NULL UNLESS EVERY LINE LANDS ON THE SAME BUDGET LINE, and that is the point. A cost transaction
   * carries ONE `budget_line_id`, but a PO may order across several categories — attributing the
   * whole total to whichever category happened to be first would overstate that budget and
   * understate the others, which is worse than the NULL it replaces. A PO that spans categories
   * stays unattributed until the ledger can hold a split, and `finance.budget.exceeded.v1` simply
   * does not fire for it.
   *
   * Reading `boq.boq_items` from here is a cross-SCHEMA read, not a cross-service one:
   * `tasks.repository.getTaskBudgetRatio` already joins the same table for the same purpose. What
   * Phase 7 forbids is querying PROCUREMENT, and this does not.
   */
  async resolveBudgetLine(project_id: string, boqItemIds: string[]): Promise<string | null> {
    if (boqItemIds.length === 0) return null;

    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<{ line_id: string; matched: bigint }[]>`
        SELECT bl.line_id::text, count(DISTINCT bi.item_id) AS matched
          FROM boq.boq_items bi
          JOIN finance.budget_lines bl
            ON bl.boq_category_id = bi.category_id
           AND bl.tenant_id       = ${this.tenantId}::uuid
           AND bl.project_id      = ${project_id}::uuid
         WHERE bi.tenant_id = ${this.tenantId}::uuid
           AND bi.item_id   = ANY(${boqItemIds}::uuid[])
         GROUP BY bl.line_id
      `,
    );

    // Exactly one budget line, and it accounts for every item on the order.
    if (rows.length !== 1) return null;
    return Number(rows[0]!.matched) === boqItemIds.length ? rows[0]!.line_id : null;
  }

  /**
   * A budget line's allocation and everything charged to it so far.
   *
   * Committed and actual are summed together: a PO that has been raised but not yet invoiced has
   * already consumed the budget as far as anyone planning against it is concerned, which is the
   * same basis `recalculateAndCheckVariance` uses at project level.
   */
  async getBudgetLineTotals(line_id: string): Promise<{
    line_id: string;
    boq_category_id: string | null;
    category_code: string | null;
    allocated_amount: string;
    charged_amount: string;
    currency_code: string;
  } | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<
          {
            line_id: string;
            boq_category_id: string | null;
            category_code: string | null;
            allocated_amount: string;
            charged_amount: string;
            currency_code: string;
          }[]
        >`
        SELECT bl.line_id::text,
               bl.boq_category_id::text,
               bc.category_code,
               bl.allocated_amount::text,
               COALESCE((
                 SELECT SUM(ct.amount) FROM finance.cost_transactions ct
                  WHERE ct.tenant_id      = ${this.tenantId}::uuid
                    AND ct.budget_line_id = bl.line_id
               ), 0)::text AS charged_amount,
               bl.currency_code
          FROM finance.budget_lines bl
          LEFT JOIN boq.boq_categories bc
            ON bc.category_id = bl.boq_category_id AND bc.tenant_id = bl.tenant_id
         WHERE bl.line_id   = ${line_id}::uuid
           AND bl.tenant_id = ${this.tenantId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  /**
   * Replace the materialized BOQ line snapshot for a version (ADR-058 CT-2c-2). DELETE + re-INSERT in one
   * tenant transaction → idempotent on event re-delivery. Materializes construction.boq.items_published.v1
   * so contract-document generation reads the itemized schedule without a cross-schema BOQ read.
   */
  /** Record a contract signature (ADR-058 CT-3/CT-5). Binds a signer + document hash + VC reference. */
  async recordContractSignature(params: {
    contract_id: string;
    signer_party: SignerParty;
    signer_identity: Record<string, unknown>;
    credential_ref: string;
    document_hash: string;
    ip_address: string;
    verification_status: SignatureVerificationStatus;
    magic_link_token_id?: string | null;
  }): Promise<ContractSignatureRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<ContractSignatureRow[]>`
        INSERT INTO finance.contract_signatures
          (tenant_id, contract_id, signer_party, signer_identity, credential_ref,
           document_hash, ip_address, magic_link_token_id, verification_status)
        VALUES
          (${this.tenantId}::uuid, ${params.contract_id}::uuid,
           ${params.signer_party}::finance."SignerParty",
           ${JSON.stringify(params.signer_identity)}::jsonb, ${params.credential_ref},
           ${params.document_hash}, ${params.ip_address}::inet,
           ${params.magic_link_token_id ?? null}::uuid,
           ${params.verification_status}::finance."SignatureVerificationStatus")
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  /** All signatures recorded against a contract, oldest first (ADR-058 CT-6 audit trail). */
  async listContractSignatures(contract_id: string): Promise<ContractSignatureRow[]> {
    return this.db.run(
      (tx) =>
        tx.$queryRaw<ContractSignatureRow[]>`
        SELECT * FROM finance.contract_signatures
         WHERE contract_id = ${contract_id}::uuid AND tenant_id = ${this.tenantId}::uuid
         ORDER BY signed_at
      `,
    );
  }

  /**
   * Atomically consume a sign-link token (single-use, ADR-058 CT-5). Returns the row on success, or
   * null when the token does not exist for this tenant, is expired, or was ALREADY consumed.
   *
   * This is a compare-and-set, not a read followed by a write, and that is the whole point. The
   * previous shape was `findActiveSignToken(...)` → issue a VC → verify it → record the signature →
   * `markSignTokenUsed(...)`: a check and a consume in separate transactions with two CredentialService
   * round-trips in between. Two concurrent POSTs to /finance/contracts/sign/:token both passed the
   * check and both recorded a CLIENT signature, so "single-use" held only when nobody raced it.
   *
   * `UPDATE ... WHERE used_at IS NULL` closes that: under READ COMMITTED the second transaction blocks
   * on the row lock, re-evaluates the predicate once the first commits, and matches zero rows.
   */
  async consumeSignToken(token_hash: string): Promise<ContractSignTokenRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<ContractSignTokenRow[]>`
        UPDATE finance.contract_sign_tokens SET used_at = now()
         WHERE tenant_id = ${this.tenantId}::uuid AND token_hash = ${token_hash}
           AND used_at IS NULL AND expires_at > now()
        RETURNING *
      `,
    );
    return rows[0] ?? null;
  }

  /** Persist an issued client sign-link token (ADR-058 CT-4). Only the token_hash is stored. */
  async createSignToken(params: {
    contract_id: string;
    token_hash: string;
    invited_name?: string | null;
    invited_email?: string | null;
    expires_at: Date;
  }): Promise<ContractSignTokenRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<ContractSignTokenRow[]>`
        INSERT INTO finance.contract_sign_tokens
          (tenant_id, contract_id, token_hash, invited_name, invited_email, expires_at)
        VALUES
          (${this.tenantId}::uuid, ${params.contract_id}::uuid, ${params.token_hash},
           ${params.invited_name ?? null}, ${params.invited_email ?? null}, ${params.expires_at})
        RETURNING *
      `,
    );
    return rows[0]!;
  }

  /** The materialized BOQ lines of the latest approved version for a project (ADR-058 CT-2c-3). */
  async findBoqSnapshotByProject(project_id: string): Promise<BoqSnapshotItem[]> {
    return this.db.run(
      (tx) =>
        tx.$queryRaw<BoqSnapshotItem[]>`
        SELECT item_code, description, unit,
               quantity::text AS quantity, unit_cost::text AS unit_cost, estimated_total::text AS estimated_total
          FROM finance.boq_line_snapshots
         WHERE tenant_id = ${this.tenantId}::uuid
           AND version_id = (
             SELECT version_id FROM finance.boq_line_snapshots
              WHERE tenant_id = ${this.tenantId}::uuid AND project_id = ${project_id}::uuid
              ORDER BY materialized_at DESC LIMIT 1
           )
         ORDER BY line_no
      `,
    );
  }

  async replaceBoqSnapshot(
    version_id: string,
    project_id: string,
    items: BoqSnapshotItem[],
  ): Promise<void> {
    await this.db.run(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM finance.boq_line_snapshots
        WHERE tenant_id = ${this.tenantId}::uuid AND version_id = ${version_id}::uuid
      `;
      for (let i = 0; i < items.length; i++) {
        const it = items[i]!;
        await tx.$executeRaw`
          INSERT INTO finance.boq_line_snapshots
            (tenant_id, version_id, project_id, line_no,
             item_code, description, unit, quantity, unit_cost, estimated_total)
          VALUES
            (${this.tenantId}::uuid, ${version_id}::uuid, ${project_id}::uuid, ${i + 1},
             ${it.item_code}, ${it.description}, ${it.unit},
             ${it.quantity}::decimal, ${it.unit_cost}::decimal, ${it.estimated_total}::decimal)
        `;
      }
    });
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
  async updateBillingStatus(params: {
    billing_id: string;
    status: 'ISSUED' | 'PAID';
    approved_by?: string | null;
  }): Promise<BillingRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<BillingRow[]>`
        UPDATE finance.billings SET
          status = ${params.status}::finance."BillingStatus",
          approved_by = COALESCE(${params.approved_by ?? null}::uuid, approved_by),
          issued_at = CASE WHEN ${params.status} = 'ISSUED' THEN now() ELSE issued_at END
        WHERE billing_id = ${params.billing_id}::uuid AND tenant_id = ${this.tenantId}::uuid
        RETURNING *
      `,
    );
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
