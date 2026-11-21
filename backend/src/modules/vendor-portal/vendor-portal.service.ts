// VendorPortalService — orchestrates the four §28 Vendor Portal capabilities (ADR-030):
//   receive RFQ · submit quotation · track PO status · submit invoice
// plus the buyer-side "issue invitation" trigger. Reuses procurement RFQ/quotation/PO/invoice
// tables (no duplicate data model). Tenant + vendor context come from VendorAuthGuard (vendor side)
// or JwtAuthGuard (buyer side); both publish into CLS.

import {
  Injectable,
  Scope,
  Inject,
  Optional,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  UnprocessableEntityException,
  ConflictException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { clsTenantId } from '../../shared/context/cls-context';
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
import { assertTenantWritable, noActiveRelationship } from './vendor-auth.guard';
import { FeatureFlagService } from '../../shared/feature-flags/feature-flag.service';

/**
 * The envelope a vendor-portal refusal carries (plan DQ, product owner 2026-11-21): its `COS-VND-*` code as
 * `error.code`, with a messageKey — the codes sat in the message text before, `error.code` being `COS-GENERAL-<n>`.
 */
function vendorError(code: string, message: string, messageKey: string) {
  return { error: { code, message, messageKey } };
}

@Injectable({ scope: Scope.REQUEST })
export class VendorPortalService {
  // See VendorPortalRepository: CLS is the reliable carrier under Fastify, the request object is a
  // mirror. Covers both the vendor path (VendorAuthGuard) and the buyer path (JwtAuthGuard).
  private get tenantId(): string {
    return (this.request as { tenantId?: string }).tenantId ?? clsTenantId();
  }

  constructor(
    private readonly repo: VendorPortalRepository,
    private readonly identities: VendorIdentityRepository,
    private readonly magicLink: MagicLinkService,
    @Inject(REQUEST) private readonly request: { tenantId?: string },
    // @Optional: absent means the flag is off, as the registry default is (as in VendorAuthGuard).
    @Optional() private readonly flags?: FeatureFlagService,
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
      throw new NotFoundException(
        vendorError('COS-VND-001', 'RFQ not found', 'vendor.rfq.notFound'),
      );
    }
    // The trading relationship below is a platform row naming one of the tenant's vendors. Since D56 no
    // foreign key checks that name (it could not, for a tenant in a dedicated database), so it is checked
    // here, before anything is written.
    if (!(await this.repo.vendorExists(params.vendorId))) {
      throw new NotFoundException(
        vendorError('COS-VND-006', 'Vendor not found', 'vendor.vendor.notFound'), // plan DR
      );
    }

    // One spelling per address: an e-mail differing only in case or surrounding spaces is the same person.
    const email = params.email.trim().toLowerCase();
    const identity = await this.identities.upsertIdentity(email, params.displayName);
    // Disabled across the vendor network (an operator's edit): an invitation could be neither opened nor answered
    // (findActiveRelationship requires an active identity), so none is issued (fix/vendor-invite-inactive).
    if (!identity.is_active) {
      throw new ConflictException({
        error: {
          code: 'COS-VND-009',
          message: 'This e-mail is disabled across the vendor network',
        },
      });
    }
    const result = await this.identities.createRelationship(
      identity.vendor_identity_id,
      this.tenantId,
      params.vendorId,
    );
    // Refused before any invitation or token exists; the relationship is left as it was.
    if ('refused' in result) {
      throw new ConflictException({
        error:
          result.refused === 'OTHER_VENDOR'
            ? {
                // One e-mail, one vendor of the tenant (fix/vendor-reinvite-refuse). "Linked", not "acts for":
                // a revoked relationship to the other vendor refuses too.
                code: 'COS-VND-007',
                message: 'This e-mail is already linked to another vendor of this tenant',
              }
            : {
                // An invitation does not undo a revocation (fix/vendor-revoked-reinvite).
                code: 'COS-VND-008',
                message: "This e-mail's link to this vendor was revoked",
              },
      });
    }

    const invitationId = randomUUID();
    const issued = this.magicLink.issueInvitationToken(this.tenantId, invitationId);
    await this.repo.createInvitation({
      invitationId,
      rfqId: params.rfqId,
      vendorIdentityId: identity.vendor_identity_id,
      invitedEmail: email,
      tokenHash: issued.tokenHash,
      expiresAt: issued.expiresAt,
    });

    return { invitationId, magicLinkToken: issued.token, expiresAt: issued.expiresAt };
  }

  // ── Tier 1: open invited RFQ + submit quotation ─────────────────────────────

  async openRfq(token: string, invitationId: string): Promise<RfqRow> {
    const invitation = await this.assertValidInvitation(token, invitationId);
    // The same standing as quoting (fix/vendor-open-rfq-relationship): a vendor revoked after it was invited, or
    // an identity disabled network-wide, could read the RFQ until the invitation expired, though it could no
    // longer quote. 403 COS-VND-005 before the RFQ is read.
    await this.resolveVendorId(invitation.vendor_identity_id);
    const rfq = await this.repo.findRfq(invitation.rfq_id);
    if (!rfq) {
      throw new NotFoundException(
        vendorError('COS-VND-001', 'RFQ not found', 'vendor.rfq.notFound'),
      );
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
    // The buyer's read-only state (an ended trial: 403 COS-PLAN-003) after the invitation and the relationship, before
    // the RFQ (plan DV, product owner 2026-11-21) — the guard leaves tier 1's write to this point.
    await assertTenantWritable('POST', this.tenantId, this.identities, this.flags);

    // Quoting is open while the RFQ is PUBLISHED, as on the buyer side (fix/quotation-duplicate-and-closed-rfq):
    // the portal used to take a quotation for an RFQ already closed, evaluated, awarded or cancelled.
    const rfq = await this.repo.findRfq(invitation.rfq_id);
    if (!rfq)
      throw new NotFoundException(
        vendorError('COS-VND-001', 'RFQ not found', 'vendor.rfq.notFound'),
      );
    // Past its deadline it is not open either, though the workflow may not have closed it yet (plan CT, product owner
    // 2026-11-20). The vendor's quotation is stamped now() by the database, so now is what is compared.
    if (rfq.status !== 'PUBLISHED' || Date.now() > new Date(rfq.deadline).getTime()) {
      throw new UnprocessableEntityException({
        error: { code: 'COS-VND-011', message: 'RFQ is not open for quotations' },
      });
    }

    const quotation = await this.repo.createQuotation({
      rfqId: invitation.rfq_id,
      vendorId,
      totalAmount: dto.total_amount,
      currencyCode: dto.currency_code,
      validityDays: dto.validity_days,
      // Marked RESPONDED in the same transaction as the quotation (see the repository).
      invitationId,
    });
    // One per vendor per RFQ, the first standing — no revision (product owner, 2026-11-20). The invitation is left
    // as it is and no session is issued.
    if (!quotation) {
      throw new ConflictException({
        error: {
          code: 'COS-VND-010',
          message: 'A quotation from this vendor already exists for this RFQ',
        },
      });
    }

    // Tier-1 → Tier-2 handoff (ADR-030, option A): responding grants a vendor session bound to the
    // vendor identity, scoped to this buyer tenant, for PO-status tracking and invoice submission.
    const vendorSession = this.magicLink.issueSessionToken(invitation.vendor_identity_id as string);
    return { quotation, vendorSession, tenantId: this.tenantId };
  }

  // ── Tier 2: track PO status, submit + list invoices ─────────────────────────

  listPurchaseOrders(vendorId: string): Promise<PurchaseOrderRow[]> {
    return this.repo.listPurchaseOrdersByVendor(vendorId);
  }

  async submitInvoice(
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
    // Object-level authorization: a Tier-2 vendor may only invoice against a PO issued to THEM. The
    // invoice's vendor_id is already forced to the authenticated caller, but po_id is caller-supplied,
    // so without this check vendor A could attach an invoice to vendor B's PO in the same tenant.
    // Verify ownership (tenant-scoped by RLS inside the repo's db.run) before creating the invoice.
    const po = await this.repo.findPurchaseOrderForVendor(dto.po_id, vendorId);
    if (!po) {
      throw new NotFoundException('Purchase order not found for this vendor');
    }
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
      throw new NotFoundException(
        vendorError('COS-VND-001', 'Invitation not found', 'vendor.invitation.notFound'),
      );
    }
    if (this.magicLink.hashToken(token) !== invitation.token_hash) {
      throw new UnauthorizedException(
        vendorError('COS-VND-002', 'Invitation token mismatch', 'vendor.invitation.tokenMismatch'),
      );
    }
    if (invitation.status !== 'PENDING') {
      throw new UnprocessableEntityException(
        vendorError('COS-VND-003', 'Invitation already used', 'vendor.invitation.used'),
      );
    }
    if (invitation.expires_at.getTime() < Date.now()) {
      throw new UnauthorizedException(
        vendorError('COS-VND-004', 'Invitation expired', 'vendor.invitation.expired'),
      );
    }
    return invitation;
  }

  private async resolveVendorId(vendorIdentityId: string | null): Promise<string> {
    if (!vendorIdentityId) {
      throw new ForbiddenException({
        error: {
          code: 'COS-VND-005',
          message: 'Invitation has no linked vendor identity',
          messageKey: 'vendor.identity.missing',
        },
      });
    }
    const relationship = await this.identities.findActiveRelationship(
      vendorIdentityId,
      this.tenantId,
    );
    // A relationship to a vendor deactivated (soft-deleted) since the invitation is not an active one: the vendor
    // row is in the tenant's database, read here with the tenant context set (fix/vendor-portal-inactive-vendor).
    if (!relationship || !(await this.repo.vendorExists(relationship.vendor_id))) {
      throw noActiveRelationship(); // COS-VND-005 (plan DP)
    }
    return relationship.vendor_id;
  }
}
