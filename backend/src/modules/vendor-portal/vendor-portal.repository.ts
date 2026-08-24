// VendorPortalRepository — tenant-scoped reads/writes for the Vendor Portal (ADR-030).
// All access via TenantPrismaService (SET LOCAL app.current_tenant_id — ADR-008). The tenant
// context is set by VendorAuthGuard (from the Tier-1 token's tenant_id or the Tier-2 relationship)
// before this request-scoped repository is constructed. It reaches TenantPrismaService via CLS —
// the request object alone is not a reliable carrier under Fastify (see vendor-auth.guard.ts).
//
// Reuses existing procurement tables (rfqs, quotations, purchase_orders, invoices) — the portal
// does not duplicate the procurement data model.

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';
import { clsTenantId } from '../../shared/context/cls-context';

export interface RfqInvitationRow {
  invitation_id: string;
  tenant_id: string;
  rfq_id: string;
  vendor_identity_id: string | null;
  invited_email: string;
  token_hash: string;
  expires_at: Date;
  status: 'PENDING' | 'RESPONDED' | 'EXPIRED';
}

export interface RfqRow {
  rfq_id: string;
  rfq_number: string;
  project_id: string;
  status: string;
  deadline: Date;
}

export interface QuotationRow {
  quotation_id: string;
  rfq_id: string;
  vendor_id: string;
  total_amount: string;
  currency_code: string;
  validity_days: number;
  submitted_at: Date;
}

export interface PurchaseOrderRow {
  po_id: string;
  po_number: string;
  status: string;
  total_amount: string;
  currency_code: string;
  delivery_date: Date;
  rfq_id: string | null;
}

export interface InvoiceRow {
  invoice_id: string;
  po_id: string;
  invoice_number: string;
  amount: string;
  currency_code: string;
  invoice_date: Date;
  due_date: Date;
  status: string;
}

export interface InvitedRfqRow {
  rfq_id: string;
  rfq_number: string;
  status: string; // RFQ status
  deadline: Date;
  invitation_status: string; // invitation status (PENDING / RESPONDED)
}

@Injectable({ scope: Scope.REQUEST })
export class VendorPortalRepository {
  // CLS is the fallback, not a nicety: under Fastify the REQUEST injected into a Scope.REQUEST
  // provider is not guaranteed to be the object the auth layer decorated. VendorAuthGuard (vendor
  // path) and JwtAuthGuard (buyer path) both publish tenant_id into CLS, so this resolves for both.
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? clsTenantId();
  }

  constructor(
    private readonly db: TenantPrismaService,
    @Inject(REQUEST) private readonly request: { tenantId?: string },
  ) {}

  // ── RFQ invitations ───────────────────────────────────────────────────────

  async createInvitation(params: {
    invitationId: string;
    rfqId: string;
    vendorIdentityId: string;
    invitedEmail: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<RfqInvitationRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<RfqInvitationRow[]>`
        INSERT INTO procurement.rfq_invitations
          (invitation_id, tenant_id, rfq_id, vendor_identity_id, invited_email, token_hash, expires_at)
        VALUES (${params.invitationId}::uuid, ${this.tenantId}::uuid, ${params.rfqId}::uuid,
                ${params.vendorIdentityId}::uuid, ${params.invitedEmail}, ${params.tokenHash},
                ${params.expiresAt})
        RETURNING invitation_id, tenant_id, rfq_id, vendor_identity_id, invited_email,
                  token_hash, expires_at, status
      `,
    );
    return rows[0];
  }

  async findInvitation(invitationId: string): Promise<RfqInvitationRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<RfqInvitationRow[]>`
        SELECT invitation_id, tenant_id, rfq_id, vendor_identity_id, invited_email,
               token_hash, expires_at, status
        FROM procurement.rfq_invitations WHERE invitation_id = ${invitationId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  async markInvitationResponded(invitationId: string): Promise<void> {
    await this.db.run(
      (tx) =>
        tx.$executeRaw`
        UPDATE procurement.rfq_invitations SET status = 'RESPONDED'
        WHERE invitation_id = ${invitationId}::uuid
      `,
    );
  }

  // ── RFQ + quotation (Tier-1 capability) ─────────────────────────────────────

  async findRfq(rfqId: string): Promise<RfqRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<RfqRow[]>`
        SELECT rfq_id, rfq_number, project_id, status, deadline
        FROM procurement.rfqs WHERE rfq_id = ${rfqId}::uuid
      `,
    );
    return rows[0] ?? null;
  }

  async createQuotation(params: {
    rfqId: string;
    vendorId: string;
    totalAmount: string;
    currencyCode: string;
    validityDays: number;
  }): Promise<QuotationRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<QuotationRow[]>`
        INSERT INTO procurement.quotations
          (rfq_id, vendor_id, tenant_id, total_amount, currency_code, validity_days, submitted_at)
        VALUES (${params.rfqId}::uuid, ${params.vendorId}::uuid, ${this.tenantId}::uuid,
                ${params.totalAmount}::decimal, ${params.currencyCode}, ${params.validityDays}, now())
        RETURNING quotation_id, rfq_id, vendor_id, total_amount, currency_code, validity_days, submitted_at
      `,
    );
    return rows[0];
  }

  // ── Purchase orders (Tier-2: track status) ──────────────────────────────────

  async listPurchaseOrdersByVendor(vendorId: string): Promise<PurchaseOrderRow[]> {
    return this.db.run(
      (tx) =>
        tx.$queryRaw<PurchaseOrderRow[]>`
        SELECT po_id, po_number, status, total_amount, currency_code, delivery_date, rfq_id
        FROM procurement.purchase_orders
        WHERE vendor_id = ${vendorId}::uuid ORDER BY created_at DESC
      `,
    );
  }

  // Fetch a single PO only if it belongs to this vendor (tenant-scoped by RLS via db.run). Used to
  // authorize invoice submission — returns null when the PO does not exist or is another vendor's.
  async findPurchaseOrderForVendor(
    poId: string,
    vendorId: string,
  ): Promise<PurchaseOrderRow | null> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<PurchaseOrderRow[]>`
        SELECT po_id, po_number, status, total_amount, currency_code, delivery_date, rfq_id
        FROM procurement.purchase_orders
        WHERE po_id = ${poId}::uuid AND vendor_id = ${vendorId}::uuid
        LIMIT 1
      `,
    );
    return rows[0] ?? null;
  }

  // ── Invoices (Tier-2: submit + list own) ────────────────────────────────────

  async createInvoice(params: {
    poId: string;
    vendorId: string;
    invoiceNumber: string;
    amount: string;
    currencyCode: string;
    invoiceDate: string;
    dueDate: string;
  }): Promise<InvoiceRow> {
    const rows = await this.db.run(
      (tx) =>
        tx.$queryRaw<InvoiceRow[]>`
        INSERT INTO procurement.invoices
          (po_id, vendor_id, tenant_id, invoice_number, amount, currency_code, invoice_date, due_date)
        VALUES (${params.poId}::uuid, ${params.vendorId}::uuid, ${this.tenantId}::uuid,
                ${params.invoiceNumber}, ${params.amount}::decimal, ${params.currencyCode},
                ${params.invoiceDate}::date, ${params.dueDate}::date)
        RETURNING invoice_id, po_id, invoice_number, amount, currency_code, invoice_date, due_date, status
      `,
    );
    return rows[0];
  }

  async listInvoicesByVendor(vendorId: string): Promise<InvoiceRow[]> {
    return this.db.run(
      (tx) =>
        tx.$queryRaw<InvoiceRow[]>`
        SELECT invoice_id, po_id, invoice_number, amount, currency_code, invoice_date, due_date, status
        FROM procurement.invoices WHERE vendor_id = ${vendorId}::uuid ORDER BY invoice_date DESC
      `,
    );
  }

  // ── Quotations (Tier-2: list own submitted quotations — G-W1, §20.7.12) ──────

  async listQuotationsByVendor(vendorId: string): Promise<QuotationRow[]> {
    return this.db.run(
      (tx) =>
        tx.$queryRaw<QuotationRow[]>`
        SELECT quotation_id, rfq_id, vendor_id, total_amount, currency_code, validity_days, submitted_at
        FROM procurement.quotations WHERE vendor_id = ${vendorId}::uuid ORDER BY submitted_at DESC
      `,
    );
  }

  // ── Invited RFQs (Tier-2 overview — G-W3, §20.7.12) ──────────────────────────
  // RFQs the vendor identity was invited to, joined with the RFQ for number/status/deadline.
  async listRfqInvitationsByVendor(vendorIdentityId: string): Promise<InvitedRfqRow[]> {
    return this.db.run(
      (tx) =>
        tx.$queryRaw<InvitedRfqRow[]>`
        SELECT r.rfq_id, r.rfq_number, r.status, r.deadline, i.status AS invitation_status
        FROM procurement.rfq_invitations i
        JOIN procurement.rfqs r ON r.rfq_id = i.rfq_id
        WHERE i.vendor_identity_id = ${vendorIdentityId}::uuid
        ORDER BY r.deadline DESC
      `,
    );
  }
}
