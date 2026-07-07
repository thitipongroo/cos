// VendorPortalService — orchestrates the four §28 Vendor Portal capabilities (ADR-030):
//   receive RFQ · submit quotation · track PO status · submit invoice
// plus the buyer-side "issue invitation" trigger. Reuses procurement RFQ/quotation/PO/invoice
// tables (no duplicate data model). Tenant + vendor context come from VendorAuthMiddleware.

import {
  Injectable,
  Scope,
  Inject,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { MagicLinkService } from './magic-link.service';
import { VendorIdentityRepository } from './vendor-identity.repository';
import {
  VendorPortalRepository,
  RfqInvitationRow,
  RfqRow,
  QuotationRow,
  PurchaseOrderRow,
  InvoiceRow,
  InvitedRfqRow,
} from './vendor-portal.repository';

@Injectable({ scope: Scope.REQUEST })
export class VendorPortalService {
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? '';
  }

  constructor(
    private readonly repo: VendorPortalRepository,
    private readonly identities: VendorIdentityRepository,
    private readonly magicLink: MagicLinkService,
    @Inject(REQUEST) private readonly request: { tenantId?: string },
  ) {}

  // ── Buyer side: issue an RFQ invitation (internal PROCUREMENT_OFFICER) ───────

  async issueInvitation(params: {
    rfqId: string;
    vendorId: string;
    email: string;
    displayName: string;
  }): Promise<{ invitationId: string; magicLinkToken: string; expiresAt: Date }> {
    const rfq = await this.repo.findRfq(params.rfqId);
    if (!rfq) {
      throw new NotFoundException('COS-VND-001: RFQ not found');
    }

    const identity = await this.identities.upsertIdentity(params.email, params.displayName);
    await this.identities.createRelationship(
      identity.vendor_identity_id,
      this.tenantId,
      params.vendorId,
    );

    const invitationId = randomUUID();
    const issued = this.magicLink.issueInvitationToken(this.tenantId, invitationId);
    await this.repo.createInvitation({
      invitationId,
      rfqId: params.rfqId,
      vendorIdentityId: identity.vendor_identity_id,
      invitedEmail: params.email,
      tokenHash: issued.tokenHash,
      expiresAt: issued.expiresAt,
    });

    return { invitationId, magicLinkToken: issued.token, expiresAt: issued.expiresAt };
  }

  // ── Tier 1: open invited RFQ + submit quotation ─────────────────────────────

  async openRfq(token: string, invitationId: string): Promise<RfqRow> {
    const invitation = await this.assertValidInvitation(token, invitationId);
    const rfq = await this.repo.findRfq(invitation.rfq_id);
    if (!rfq) {
      throw new NotFoundException('COS-VND-001: RFQ not found');
    }
    return rfq;
  }

  async submitQuotation(
    token: string,
    invitationId: string,
    dto: { total_amount: string; currency_code: string; validity_days: number },
  ): Promise<{ quotation: QuotationRow; vendorSession: string; tenantId: string }> {
    const invitation = await this.assertValidInvitation(token, invitationId);
    const vendorId = await this.resolveVendorId(invitation.vendor_identity_id);

    const quotation = await this.repo.createQuotation({
      rfqId: invitation.rfq_id,
      vendorId,
      totalAmount: dto.total_amount,
      currencyCode: dto.currency_code,
      validityDays: dto.validity_days,
    });
    await this.repo.markInvitationResponded(invitationId);

    // Tier-1 → Tier-2 handoff (ADR-030, option A): responding grants a vendor session bound to the
    // vendor identity, scoped to this buyer tenant, for PO-status tracking and invoice submission.
    const vendorSession = this.magicLink.issueSessionToken(invitation.vendor_identity_id as string);
    return { quotation, vendorSession, tenantId: this.tenantId };
  }

  // ── Tier 2: track PO status, submit + list invoices ─────────────────────────

  listPurchaseOrders(vendorId: string): Promise<PurchaseOrderRow[]> {
    return this.repo.listPurchaseOrdersByVendor(vendorId);
  }

  submitInvoice(
    vendorId: string,
    dto: {
      po_id: string;
      invoice_number: string;
      amount: string;
      currency_code: string;
      invoice_date: string;
      due_date: string;
    },
  ): Promise<InvoiceRow> {
    return this.repo.createInvoice({
      poId: dto.po_id,
      vendorId,
      invoiceNumber: dto.invoice_number,
      amount: dto.amount,
      currencyCode: dto.currency_code,
      invoiceDate: dto.invoice_date,
      dueDate: dto.due_date,
    });
  }

  listInvoices(vendorId: string): Promise<InvoiceRow[]> {
    return this.repo.listInvoicesByVendor(vendorId);
  }

  listQuotations(vendorId: string): Promise<QuotationRow[]> {
    return this.repo.listQuotationsByVendor(vendorId);
  }

  listInvitedRfqs(vendorIdentityId: string): Promise<InvitedRfqRow[]> {
    return this.repo.listRfqInvitationsByVendor(vendorIdentityId);
  }

  // ── internals ───────────────────────────────────────────────────────────────

  private async assertValidInvitation(
    token: string,
    invitationId: string,
  ): Promise<RfqInvitationRow> {
    const invitation = await this.repo.findInvitation(invitationId);
    if (!invitation) {
      throw new NotFoundException('COS-VND-001: Invitation not found');
    }
    if (this.magicLink.hashToken(token) !== invitation.token_hash) {
      throw new UnauthorizedException('COS-VND-002: Invitation token mismatch');
    }
    if (invitation.status !== 'PENDING') {
      throw new UnprocessableEntityException('COS-VND-003: Invitation already used');
    }
    if (invitation.expires_at.getTime() < Date.now()) {
      throw new UnauthorizedException('COS-VND-004: Invitation expired');
    }
    return invitation;
  }

  private async resolveVendorId(vendorIdentityId: string | null): Promise<string> {
    if (!vendorIdentityId) {
      throw new ForbiddenException('COS-VND-005: Invitation has no linked vendor identity');
    }
    const relationship = await this.identities.findActiveRelationship(
      vendorIdentityId,
      this.tenantId,
    );
    if (!relationship) {
      throw new ForbiddenException('COS-VND-005: No active trading relationship');
    }
    return relationship.vendor_id;
  }
}
