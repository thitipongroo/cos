// Procurement Repository — Phase 5
// All DB access via TenantPrismaService (SET LOCAL app.current_tenant_id per request — ADR-008).
// Uses $queryRaw (parameterized tagged template) — never raw string interpolation.
// Financial fields stored as DECIMAL(19,4); returned as string by Prisma for precision.

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';

// Row types live in ./procurement.rows; imported here for the method signatures below and re-exported
// so existing `from './procurement.repository'` type imports (service, specs) keep resolving.
import type {
  VendorRow,
  PurchaseRequestRow,
  RfqRow,
  QuotationRow,
  PurchaseOrderRow,
  PoLineItemRow,
  DeliveryRow,
  DeliveryItemRow,
  InvoiceRow,
} from './procurement.rows';

export type * from './procurement.rows';

// ── Repository ────────────────────────────────────────────────────────────

@Injectable({ scope: Scope.REQUEST })
export class ProcurementRepository {
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? '';
  }

  constructor(
    private readonly db: TenantPrismaService,
    @Inject(REQUEST) private readonly request: Request & { tenantId?: string },
  ) {}

  // ── Vendors ──────────────────────────────────────────────────────────────

  async createVendor(params: {
    vendor_code: string;
    vendor_name: string;
    tax_id?: string;
    contact_email?: string;
    contact_phone?: string;
    address?: string;
  }): Promise<VendorRow> {
    const rows = await this.db.run(
      (prisma) =>
        prisma.$queryRaw<VendorRow[]>`
        INSERT INTO procurement.vendors (tenant_id, vendor_code, vendor_name, tax_id, contact_email, contact_phone, address)
        VALUES (${this.tenantId}::uuid, ${params.vendor_code}, ${params.vendor_name},
                ${params.tax_id ?? null}, ${params.contact_email ?? null},
                ${params.contact_phone ?? null}, ${params.address ?? null})
        RETURNING *`,
    );
    return rows[0]!;
  }

  async findVendorById(vendor_id: string): Promise<VendorRow | null> {
    const rows = await this.db.run(
      (prisma) =>
        prisma.$queryRaw<VendorRow[]>`
        SELECT * FROM procurement.vendors
        WHERE vendor_id = ${vendor_id}::uuid AND tenant_id = ${this.tenantId}::uuid`,
    );
    return rows[0] ?? null;
  }

  async listVendors(active_only: boolean): Promise<VendorRow[]> {
    return this.db.run((prisma) =>
      active_only
        ? prisma.$queryRaw<VendorRow[]>`
            SELECT * FROM procurement.vendors
            WHERE tenant_id = ${this.tenantId}::uuid AND is_active = true
            ORDER BY vendor_name`
        : prisma.$queryRaw<VendorRow[]>`
            SELECT * FROM procurement.vendors
            WHERE tenant_id = ${this.tenantId}::uuid
            ORDER BY vendor_name`,
    );
  }

  async deactivateVendor(vendor_id: string): Promise<void> {
    await this.db.run(
      (prisma) =>
        prisma.$executeRaw`
        UPDATE procurement.vendors SET is_active = false, updated_at = now()
        WHERE vendor_id = ${vendor_id}::uuid AND tenant_id = ${this.tenantId}::uuid`,
    );
  }

  // ── Purchase Requests ─────────────────────────────────────────────────────

  async createPurchaseRequest(params: {
    project_id: string;
    pr_number: string;
    requested_by: string;
    required_date?: string;
    items?: Array<{ description: string; quantity: number; unit: string; material_id?: string }>;
  }): Promise<PurchaseRequestRow> {
    // PR + its lines in one transaction: a request that records no materials is not a request, so
    // the two must not be able to land separately.
    return this.db.run(async (prisma) => {
      const rows = await prisma.$queryRaw<PurchaseRequestRow[]>`
        INSERT INTO procurement.purchase_requests (project_id, tenant_id, pr_number, requested_by, required_date)
        VALUES (${params.project_id}::uuid, ${this.tenantId}::uuid, ${params.pr_number},
                ${params.requested_by}::uuid, ${params.required_date ?? null}::date)
        RETURNING *`;
      const pr = rows[0]!;
      const items = params.items ?? [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i]!;
        await prisma.$executeRaw`
          INSERT INTO procurement.pr_line_items
            (pr_id, tenant_id, material_id, description, quantity, unit, sort_order)
          VALUES (${pr.pr_id}::uuid, ${this.tenantId}::uuid, ${it.material_id ?? null}::uuid,
                  ${it.description}, ${it.quantity}::decimal, ${it.unit}, ${i})`;
      }
      return pr;
    });
  }

  /**
   * Next PR number for the tenant, as `PR-<year>-<seq>`.
   *
   * Derived from the highest existing number for that year rather than a sequence, so the series
   * stays per-tenant (pr_number is unique per tenant, not globally) and restarts each January.
   * Called inside the caller's transaction; concurrent creates collide on uq_pr_tenant_number, which
   * is the constraint doing the real work here.
   */
  async nextPrNumber(year: number): Promise<string> {
    const prefix = `PR-${year}-`;
    const rows = await this.db.run(
      (prisma) =>
        prisma.$queryRaw<Array<{ max_seq: number | null }>>`
        SELECT MAX(NULLIF(regexp_replace(pr_number, '^PR-[0-9]{4}-', ''), '')::int) AS max_seq
        FROM procurement.purchase_requests
        WHERE tenant_id = ${this.tenantId}::uuid
          AND pr_number LIKE ${prefix + '%'}`,
    );
    const next = (rows[0]?.max_seq ?? 0) + 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  async findPrById(pr_id: string): Promise<PurchaseRequestRow | null> {
    const rows = await this.db.run(
      (prisma) =>
        prisma.$queryRaw<PurchaseRequestRow[]>`
        SELECT * FROM procurement.purchase_requests
        WHERE pr_id = ${pr_id}::uuid AND tenant_id = ${this.tenantId}::uuid`,
    );
    return rows[0] ?? null;
  }

  async updatePrStatus(pr_id: string, status: PurchaseRequestRow['status']): Promise<void> {
    await this.db.run(
      (prisma) =>
        prisma.$executeRaw`
        UPDATE procurement.purchase_requests
        SET status = ${status}, updated_at = now()
        WHERE pr_id = ${pr_id}::uuid AND tenant_id = ${this.tenantId}::uuid`,
    );
  }

  // ── RFQs ─────────────────────────────────────────────────────────────────

  async createRfq(params: {
    pr_id?: string;
    project_id: string;
    rfq_number: string;
    deadline: string;
    created_by: string;
  }): Promise<RfqRow> {
    const rows = await this.db.run(
      (prisma) =>
        prisma.$queryRaw<RfqRow[]>`
        INSERT INTO procurement.rfqs (pr_id, project_id, tenant_id, rfq_number, deadline, created_by)
        VALUES (${params.pr_id ?? null}::uuid, ${params.project_id}::uuid, ${this.tenantId}::uuid,
                ${params.rfq_number}, ${params.deadline}::timestamptz, ${params.created_by}::uuid)
        RETURNING *`,
    );
    return rows[0]!;
  }

  async findRfqById(rfq_id: string): Promise<RfqRow | null> {
    const rows = await this.db.run(
      (prisma) =>
        prisma.$queryRaw<RfqRow[]>`
        SELECT * FROM procurement.rfqs
        WHERE rfq_id = ${rfq_id}::uuid AND tenant_id = ${this.tenantId}::uuid`,
    );
    return rows[0] ?? null;
  }

  async updateRfqStatus(rfq_id: string, status: RfqRow['status']): Promise<void> {
    await this.db.run(
      (prisma) =>
        prisma.$executeRaw`
        UPDATE procurement.rfqs SET status = ${status}, updated_at = now()
        WHERE rfq_id = ${rfq_id}::uuid AND tenant_id = ${this.tenantId}::uuid`,
    );
  }

  async setRfqWorkflowId(rfq_id: string, workflow_id: string): Promise<void> {
    await this.db.run(
      (prisma) =>
        prisma.$executeRaw`
        UPDATE procurement.rfqs SET temporal_workflow_id = ${workflow_id}, updated_at = now()
        WHERE rfq_id = ${rfq_id}::uuid AND tenant_id = ${this.tenantId}::uuid`,
    );
  }

  // ── Quotations ────────────────────────────────────────────────────────────

  async createQuotation(params: {
    rfq_id: string;
    vendor_id: string;
    total_amount: string;
    currency_code: string;
    validity_days: number;
    submitted_at: string;
  }): Promise<QuotationRow> {
    const rows = await this.db.run(
      (prisma) =>
        prisma.$queryRaw<QuotationRow[]>`
        INSERT INTO procurement.quotations (rfq_id, vendor_id, tenant_id, total_amount, currency_code, validity_days, submitted_at)
        VALUES (${params.rfq_id}::uuid, ${params.vendor_id}::uuid, ${this.tenantId}::uuid,
                ${params.total_amount}::decimal, ${params.currency_code},
                ${params.validity_days}, ${params.submitted_at}::timestamptz)
        RETURNING *`,
    );
    return rows[0]!;
  }

  async findQuotationsByRfq(rfq_id: string): Promise<QuotationRow[]> {
    return this.db.run(
      (prisma) =>
        prisma.$queryRaw<QuotationRow[]>`
        SELECT * FROM procurement.quotations
        WHERE rfq_id = ${rfq_id}::uuid AND tenant_id = ${this.tenantId}::uuid
        ORDER BY total_amount ASC`,
    );
  }

  // Vendor quotation history — all quotations this vendor has submitted (across RFQs),
  // tenant-scoped, newest first (spec §14 vendor quotation history).
  async findQuotationsByVendor(vendor_id: string): Promise<QuotationRow[]> {
    return this.db.run(
      (prisma) =>
        prisma.$queryRaw<QuotationRow[]>`
        SELECT * FROM procurement.quotations
        WHERE vendor_id = ${vendor_id}::uuid AND tenant_id = ${this.tenantId}::uuid
        ORDER BY submitted_at DESC`,
    );
  }

  async markQuotationSelected(quotation_id: string, rfq_id: string): Promise<void> {
    // Clear previous selection, then set new one — single transaction via db.run
    await this.db.run(async (prisma) => {
      await prisma.$executeRaw`
        UPDATE procurement.quotations SET is_selected = false
        WHERE rfq_id = ${rfq_id}::uuid AND tenant_id = ${this.tenantId}::uuid`;
      await prisma.$executeRaw`
        UPDATE procurement.quotations SET is_selected = true
        WHERE quotation_id = ${quotation_id}::uuid AND tenant_id = ${this.tenantId}::uuid`;
    });
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────

  async createPurchaseOrder(params: {
    rfq_id?: string;
    vendor_id: string;
    project_id: string;
    po_number: string;
    total_amount: string;
    currency_code: string;
    delivery_date: string;
    created_by: string;
  }): Promise<PurchaseOrderRow> {
    const rows = await this.db.run(
      (prisma) =>
        prisma.$queryRaw<PurchaseOrderRow[]>`
        INSERT INTO procurement.purchase_orders (rfq_id, vendor_id, project_id, tenant_id, po_number,
                                     total_amount, currency_code, delivery_date, created_by)
        VALUES (${params.rfq_id ?? null}::uuid, ${params.vendor_id}::uuid,
                ${params.project_id}::uuid, ${this.tenantId}::uuid, ${params.po_number},
                ${params.total_amount}::decimal, ${params.currency_code},
                ${params.delivery_date}::date, ${params.created_by}::uuid)
        RETURNING *`,
    );
    return rows[0]!;
  }

  async findPoById(po_id: string): Promise<PurchaseOrderRow | null> {
    const rows = await this.db.run(
      (prisma) =>
        prisma.$queryRaw<PurchaseOrderRow[]>`
        SELECT * FROM procurement.purchase_orders
        WHERE po_id = ${po_id}::uuid AND tenant_id = ${this.tenantId}::uuid`,
    );
    return rows[0] ?? null;
  }

  // ── Tenant-wide list methods (AIP-132 List / AIP-159 cross-collection) ───────
  // Tenant scoping is enforced by RLS + the tenant_id predicate; project_id and
  // status are optional filters. Mirrors the optional-filter idiom in site-ops.

  async listPurchaseRequestsTenant(params: {
    project_id?: string;
    status?: string;
    page: number;
    limit: number;
  }): Promise<{ rows: PurchaseRequestRow[]; total: number }> {
    const offset = (params.page - 1) * params.limit;
    const rows = await this.db.run(
      (prisma) =>
        prisma.$queryRaw<PurchaseRequestRow[]>`
        SELECT * FROM procurement.purchase_requests
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${params.project_id ?? null}::uuid IS NULL OR project_id = ${params.project_id ?? null}::uuid)
          AND (${params.status ?? null}::text IS NULL OR status = ${params.status ?? null}::text)
        ORDER BY created_at DESC
        LIMIT ${params.limit} OFFSET ${offset}`,
    );
    const countRows = await this.db.run(
      (prisma) =>
        prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM procurement.purchase_requests
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${params.project_id ?? null}::uuid IS NULL OR project_id = ${params.project_id ?? null}::uuid)
          AND (${params.status ?? null}::text IS NULL OR status = ${params.status ?? null}::text)`,
    );
    return { rows, total: Number(countRows[0].count) };
  }

  async listRfqsTenant(params: {
    project_id?: string;
    status?: string;
    page: number;
    limit: number;
  }): Promise<{ rows: RfqRow[]; total: number }> {
    const offset = (params.page - 1) * params.limit;
    const rows = await this.db.run(
      (prisma) =>
        prisma.$queryRaw<RfqRow[]>`
        SELECT * FROM procurement.rfqs
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${params.project_id ?? null}::uuid IS NULL OR project_id = ${params.project_id ?? null}::uuid)
          AND (${params.status ?? null}::text IS NULL OR status = ${params.status ?? null}::text)
        ORDER BY created_at DESC
        LIMIT ${params.limit} OFFSET ${offset}`,
    );
    const countRows = await this.db.run(
      (prisma) =>
        prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM procurement.rfqs
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${params.project_id ?? null}::uuid IS NULL OR project_id = ${params.project_id ?? null}::uuid)
          AND (${params.status ?? null}::text IS NULL OR status = ${params.status ?? null}::text)`,
    );
    return { rows, total: Number(countRows[0].count) };
  }

  async listPurchaseOrdersTenant(params: {
    project_id?: string;
    status?: string;
    page: number;
    limit: number;
  }): Promise<{ rows: PurchaseOrderRow[]; total: number }> {
    const offset = (params.page - 1) * params.limit;
    const rows = await this.db.run(
      (prisma) =>
        prisma.$queryRaw<PurchaseOrderRow[]>`
        SELECT * FROM procurement.purchase_orders
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${params.project_id ?? null}::uuid IS NULL OR project_id = ${params.project_id ?? null}::uuid)
          AND (${params.status ?? null}::text IS NULL OR status = ${params.status ?? null}::text)
        ORDER BY created_at DESC
        LIMIT ${params.limit} OFFSET ${offset}`,
    );
    const countRows = await this.db.run(
      (prisma) =>
        prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM procurement.purchase_orders
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${params.project_id ?? null}::uuid IS NULL OR project_id = ${params.project_id ?? null}::uuid)
          AND (${params.status ?? null}::text IS NULL OR status = ${params.status ?? null}::text)`,
    );
    return { rows, total: Number(countRows[0].count) };
  }

  async listDeliveriesTenant(params: {
    po_id?: string;
    page: number;
    limit: number;
  }): Promise<{ rows: DeliveryRow[]; total: number }> {
    const offset = (params.page - 1) * params.limit;
    const rows = await this.db.run(
      (prisma) =>
        prisma.$queryRaw<DeliveryRow[]>`
        SELECT * FROM procurement.deliveries
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${params.po_id ?? null}::uuid IS NULL OR po_id = ${params.po_id ?? null}::uuid)
        ORDER BY delivered_at DESC
        LIMIT ${params.limit} OFFSET ${offset}`,
    );
    const countRows = await this.db.run(
      (prisma) =>
        prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM procurement.deliveries
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${params.po_id ?? null}::uuid IS NULL OR po_id = ${params.po_id ?? null}::uuid)`,
    );
    return { rows, total: Number(countRows[0].count) };
  }

  async updatePoStatus(po_id: string, status: PurchaseOrderRow['status']): Promise<void> {
    await this.db.run(
      (prisma) =>
        prisma.$executeRaw`
        UPDATE procurement.purchase_orders SET status = ${status}, updated_at = now()
        WHERE po_id = ${po_id}::uuid AND tenant_id = ${this.tenantId}::uuid`,
    );
  }

  async setPoWorkflowId(po_id: string, workflow_id: string): Promise<void> {
    await this.db.run(
      (prisma) =>
        prisma.$executeRaw`
        UPDATE procurement.purchase_orders SET temporal_workflow_id = ${workflow_id}, updated_at = now()
        WHERE po_id = ${po_id}::uuid AND tenant_id = ${this.tenantId}::uuid`,
    );
  }

  // ── PO Line Items ─────────────────────────────────────────────────────────

  async createLineItems(
    po_id: string,
    items: Array<{
      boq_item_id?: string;
      description: string;
      quantity: string;
      unit: string;
      unit_price: string;
      line_total: string;
    }>,
  ): Promise<PoLineItemRow[]> {
    const result: PoLineItemRow[] = [];
    for (const item of items) {
      const rows = await this.db.run(
        (prisma) =>
          prisma.$queryRaw<PoLineItemRow[]>`
          INSERT INTO procurement.po_line_items (po_id, tenant_id, boq_item_id, description, quantity, unit, unit_price, line_total)
          VALUES (${po_id}::uuid, ${this.tenantId}::uuid, ${item.boq_item_id ?? null}::uuid,
                  ${item.description}, ${item.quantity}::decimal, ${item.unit},
                  ${item.unit_price}::decimal, ${item.line_total}::decimal)
          RETURNING *`,
      );
      result.push(rows[0]!);
    }
    return result;
  }

  async findLineItemsByPo(po_id: string): Promise<PoLineItemRow[]> {
    return this.db.run(
      (prisma) =>
        prisma.$queryRaw<PoLineItemRow[]>`
        SELECT * FROM procurement.po_line_items
        WHERE po_id = ${po_id}::uuid AND tenant_id = ${this.tenantId}::uuid`,
    );
  }

  // ── Deliveries ────────────────────────────────────────────────────────────

  async createDelivery(params: {
    po_id: string;
    delivery_note?: string;
    delivered_at: string;
    received_by: string;
    notes?: string;
    items: Array<{ line_id: string; quantity_received: string }>;
  }): Promise<{ delivery: DeliveryRow; items: DeliveryItemRow[] }> {
    return this.db.run(async (prisma) => {
      const deliveries = await prisma.$queryRaw<DeliveryRow[]>`
        INSERT INTO procurement.deliveries (po_id, tenant_id, delivery_note, delivered_at, received_by, notes)
        VALUES (${params.po_id}::uuid, ${this.tenantId}::uuid,
                ${params.delivery_note ?? null}, ${params.delivered_at}::timestamptz,
                ${params.received_by}::uuid, ${params.notes ?? null})
        RETURNING *`;
      const delivery = deliveries[0]!;

      const deliveryItems: DeliveryItemRow[] = [];
      for (const item of params.items) {
        const rows = await prisma.$queryRaw<DeliveryItemRow[]>`
          INSERT INTO procurement.delivery_items (delivery_id, line_id, tenant_id, quantity_received)
          VALUES (${delivery.delivery_id}::uuid, ${item.line_id}::uuid,
                  ${this.tenantId}::uuid, ${item.quantity_received}::decimal)
          RETURNING *`;
        deliveryItems.push(rows[0]!);
      }

      return { delivery, items: deliveryItems };
    });
  }

  async findDeliveriesByPo(po_id: string): Promise<DeliveryRow[]> {
    return this.db.run(
      (prisma) =>
        prisma.$queryRaw<DeliveryRow[]>`
        SELECT * FROM procurement.deliveries
        WHERE po_id = ${po_id}::uuid AND tenant_id = ${this.tenantId}::uuid
        ORDER BY delivered_at DESC`,
    );
  }

  // ── Invoices ──────────────────────────────────────────────────────────────

  async createInvoice(params: {
    po_id: string;
    vendor_id: string;
    invoice_number: string;
    amount: string;
    currency_code: string;
    invoice_date: string;
    due_date: string;
    file_id?: string;
  }): Promise<InvoiceRow> {
    const rows = await this.db.run(
      (prisma) =>
        prisma.$queryRaw<InvoiceRow[]>`
        INSERT INTO procurement.invoices (po_id, vendor_id, tenant_id, invoice_number, amount, currency_code,
                              invoice_date, due_date, file_id)
        VALUES (${params.po_id}::uuid, ${params.vendor_id}::uuid, ${this.tenantId}::uuid,
                ${params.invoice_number}, ${params.amount}::decimal, ${params.currency_code},
                ${params.invoice_date}::date, ${params.due_date}::date,
                ${params.file_id ?? null}::uuid)
        RETURNING *`,
    );
    return rows[0]!;
  }

  async findInvoiceById(invoice_id: string): Promise<InvoiceRow | null> {
    const rows = await this.db.run(
      (prisma) =>
        prisma.$queryRaw<InvoiceRow[]>`
        SELECT * FROM procurement.invoices
        WHERE invoice_id = ${invoice_id}::uuid AND tenant_id = ${this.tenantId}::uuid`,
    );
    return rows[0] ?? null;
  }

  // Tenant-wide vendor-invoice list (AIP-132 AP queue); optional po_id / status filters.
  async findInvoices(params: {
    po_id?: string;
    status?: string;
    page: number;
    limit: number;
  }): Promise<{ rows: InvoiceRow[]; total: number }> {
    const offset = (params.page - 1) * params.limit;
    const rows = await this.db.run(
      (prisma) =>
        prisma.$queryRaw<InvoiceRow[]>`
        SELECT * FROM procurement.invoices
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${params.po_id ?? null}::uuid IS NULL OR po_id = ${params.po_id ?? null}::uuid)
          AND (${params.status ?? null}::text IS NULL OR status = ${params.status ?? null}::text)
        ORDER BY invoice_date DESC
        LIMIT ${params.limit} OFFSET ${offset}`,
    );
    const countRows = await this.db.run(
      (prisma) =>
        prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count FROM procurement.invoices
        WHERE tenant_id = ${this.tenantId}::uuid
          AND (${params.po_id ?? null}::uuid IS NULL OR po_id = ${params.po_id ?? null}::uuid)
          AND (${params.status ?? null}::text IS NULL OR status = ${params.status ?? null}::text)`,
    );
    return { rows, total: Number(countRows[0]?.count ?? 0) };
  }

  async updateInvoiceStatus(invoice_id: string, status: InvoiceRow['status']): Promise<void> {
    await this.db.run(
      (prisma) =>
        prisma.$executeRaw`
        UPDATE procurement.invoices SET status = ${status}
        WHERE invoice_id = ${invoice_id}::uuid AND tenant_id = ${this.tenantId}::uuid`,
    );
  }

  // G-M14 — set the invoice's free-text note.
  async updateInvoiceNote(invoice_id: string, note: string): Promise<void> {
    await this.db.run(
      (prisma) =>
        prisma.$executeRaw`
        UPDATE procurement.invoices SET note = ${note}
        WHERE invoice_id = ${invoice_id}::uuid AND tenant_id = ${this.tenantId}::uuid`,
    );
  }

  // ── Vendor scoring metrics (G-W5) — per-vendor inputs for the VendorScoring adapter ──────────────
  // Formulas decided with the product owner (world-class scorecard patterns over verified data):
  //   OTD    = deliveries received within delivery_date + 2-day grace / total deliveries.
  //   quality= 1 − (disputed invoices / total invoices)  [proxy; spec §22.6 behavioral signal].
  //   price  = avg over the vendor's quotations of (lowest quote on that RFQ / vendor's quote).

  async vendorOtdStats(vendorId: string): Promise<{ on_time: number; total: number }> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<Array<{ on_time: bigint; total: bigint }>>`
        SELECT COUNT(*) FILTER (
                 WHERE d.delivered_at::date <= po.delivery_date + INTERVAL '2 days'
               ) AS on_time,
               COUNT(*) AS total
        FROM procurement.deliveries d
        JOIN procurement.purchase_orders po ON po.po_id = d.po_id
        WHERE po.vendor_id = ${vendorId}::uuid AND po.tenant_id = ${this.tenantId}::uuid`,
    );
    return { on_time: Number(rows[0]?.on_time ?? 0), total: Number(rows[0]?.total ?? 0) };
  }

  async vendorDisputeStats(vendorId: string): Promise<{ disputed: number; total: number }> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<Array<{ disputed: bigint; total: bigint }>>`
        SELECT COUNT(*) FILTER (WHERE status = 'DISPUTED') AS disputed, COUNT(*) AS total
        FROM procurement.invoices
        WHERE vendor_id = ${vendorId}::uuid AND tenant_id = ${this.tenantId}::uuid`,
    );
    return { disputed: Number(rows[0]?.disputed ?? 0), total: Number(rows[0]?.total ?? 0) };
  }

  async vendorPriceStats(vendorId: string): Promise<{ price_pct: number | null; count: number }> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<Array<{ price_pct: number | null; cnt: bigint }>>`
        SELECT AVG(m.min_amount / q.total_amount) * 100 AS price_pct, COUNT(*) AS cnt
        FROM procurement.quotations q
        JOIN (
          SELECT rfq_id, MIN(total_amount) AS min_amount
          FROM procurement.quotations GROUP BY rfq_id
        ) m ON m.rfq_id = q.rfq_id
        WHERE q.vendor_id = ${vendorId}::uuid AND q.tenant_id = ${this.tenantId}::uuid`,
    );
    return {
      price_pct: rows[0]?.price_pct != null ? Number(rows[0].price_pct) : null,
      count: Number(rows[0]?.cnt ?? 0),
    };
  }

  // ── Total quantity delivered helper ───────────────────────────────────────

  async sumDeliveredQuantity(line_id: string): Promise<string> {
    const rows = await this.db.run(
      (prisma) =>
        prisma.$queryRaw<Array<{ total: string }>>`
        SELECT COALESCE(SUM(quantity_received), 0)::text AS total
        FROM procurement.delivery_items di
        JOIN procurement.deliveries d ON di.delivery_id = d.delivery_id
        WHERE di.line_id = ${line_id}::uuid AND di.tenant_id = ${this.tenantId}::uuid`,
    );
    return rows[0]?.total ?? '0';
  }
}
