// VendorPortalRepository — tenant-scoped reads/writes for the Vendor Portal (ADR-030).
// All access via TenantPrismaService (SET LOCAL app.current_tenant_id — ADR-008). The tenant
// context is set by VendorAuthGuard (from the Tier-1 token's tenant_id or the Tier-2 relationship)
// before this request-scoped repository is constructed.
//
// Reuses existing procurement tables (rfqs, quotations, purchase_orders, invoices) — the portal
// does not duplicate the procurement data model.

import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { TenantPrismaService } from '../tenant/prisma/tenant-prisma.service';

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

@Injectable({ scope: Scope.REQUEST })
export class VendorPortalRepository {
  private readonly tenantId: string;

  constructor(
    private readonly db: TenantPrismaService,
    @Inject(REQUEST) request: { tenantId?: string },
  ) {
    this.tenantId = request.tenantId ?? '';
  }

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
}
