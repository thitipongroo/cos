import {
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { VendorPortalService } from '../vendor-portal.service';

const validInvitation = {
  invitation_id: 'inv-1',
  tenant_id: 'ten-1',
  rfq_id: 'rfq-1',
  vendor_identity_id: 'vid-1',
  invited_email: 'a@b.co',
  token_hash: 'HASH',
  expires_at: new Date(Date.now() + 10_000),
  status: 'PENDING' as const,
};

function build(
  overrides: {
    invitation?: unknown;
    rfq?: unknown;
    hash?: string;
    relationship?: unknown;
  } = {},
) {
  const repo = {
    findInvitation: jest
      .fn()
      .mockResolvedValue('invitation' in overrides ? overrides.invitation : validInvitation),
    findRfq: jest
      .fn()
      .mockResolvedValue(
        'rfq' in overrides ? overrides.rfq : { rfq_id: 'rfq-1', rfq_number: 'RFQ-1' },
      ),
    createInvitation: jest.fn().mockResolvedValue({ invitation_id: 'inv-1' }),
    createQuotation: jest.fn().mockResolvedValue({ quotation_id: 'q-1' }),
    markInvitationResponded: jest.fn().mockResolvedValue(undefined),
    listPurchaseOrdersByVendor: jest.fn().mockResolvedValue([{ po_id: 'po-1' }]),
    findPurchaseOrderForVendor: jest.fn().mockResolvedValue({ po_id: 'po-1' }),
    createInvoice: jest.fn().mockResolvedValue({ invoice_id: 'i-1' }),
    listInvoicesByVendor: jest.fn().mockResolvedValue([{ invoice_id: 'i-1' }]),
    listQuotationsByVendor: jest.fn().mockResolvedValue([{ quotation_id: 'q-1' }]),
    listRfqInvitationsByVendor: jest.fn().mockResolvedValue([{ rfq_id: 'r-1' }]),
  };
  const identities = {
    upsertIdentity: jest.fn().mockResolvedValue({ vendor_identity_id: 'vid-1' }),
    createRelationship: jest.fn().mockResolvedValue({ relationship_id: 'rel-1' }),
    findActiveRelationship: jest
      .fn()
      .mockResolvedValue(
        overrides.relationship === undefined ? { vendor_id: 'ven-1' } : overrides.relationship,
      ),
  };
  const magicLink = {
    hashToken: jest.fn().mockReturnValue(overrides.hash ?? 'HASH'),
    issueInvitationToken: jest
      .fn()
      .mockReturnValue({ token: 'TOK', tokenHash: 'HASH', expiresAt: new Date(Date.now() + 1000) }),
    issueSessionToken: jest.fn().mockReturnValue('SESSION'),
  };
  const service = new VendorPortalService(repo as never, identities as never, magicLink as never, {
    tenantId: 'ten-1',
  });
  return { service, repo, identities, magicLink };
}

describe('VendorPortalService', () => {
  describe('issueInvitation', () => {
    it('404 when RFQ not found', async () => {
      const { service } = build({ rfq: null });
      await expect(
        service.issueInvitation({
          rfqId: 'rfq-1',
          vendorId: 'ven-1',
          email: 'a@b.co',
          displayName: 'ACME',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('issues identity, relationship, token and invitation', async () => {
      const { service, identities, repo } = build();
      const result = await service.issueInvitation({
        rfqId: 'rfq-1',
        vendorId: 'ven-1',
        email: 'a@b.co',
        displayName: 'ACME',
      });
      expect(identities.upsertIdentity).toHaveBeenCalledWith('a@b.co', 'ACME');
      expect(identities.createRelationship).toHaveBeenCalledWith('vid-1', 'ten-1', 'ven-1');
      expect(repo.createInvitation).toHaveBeenCalled();
      expect(result).toEqual({
        invitationId: expect.any(String),
        magicLinkToken: 'TOK',
        expiresAt: expect.any(Date),
      });
    });
  });

  describe('openRfq (invitation validation)', () => {
    it('404 when invitation not found', async () => {
      const { service } = build({ invitation: null });
      await expect(service.openRfq('TOK', 'inv-1')).rejects.toThrow(NotFoundException);
    });

    it('401 when token hash mismatches', async () => {
      const { service } = build({ hash: 'OTHER' });
      await expect(service.openRfq('TOK', 'inv-1')).rejects.toThrow(UnauthorizedException);
    });

    it('422 when invitation already used', async () => {
      const { service } = build({ invitation: { ...validInvitation, status: 'RESPONDED' } });
      await expect(service.openRfq('TOK', 'inv-1')).rejects.toThrow(UnprocessableEntityException);
    });

    it('401 when invitation expired', async () => {
      const { service } = build({
        invitation: { ...validInvitation, expires_at: new Date(Date.now() - 1) },
      });
      await expect(service.openRfq('TOK', 'inv-1')).rejects.toThrow(UnauthorizedException);
    });

    it('404 when the RFQ row is gone', async () => {
      const { service } = build({ rfq: null });
      await expect(service.openRfq('TOK', 'inv-1')).rejects.toThrow(NotFoundException);
    });

    it('returns the RFQ on success', async () => {
      const { service } = build();
      expect(await service.openRfq('TOK', 'inv-1')).toEqual({
        rfq_id: 'rfq-1',
        rfq_number: 'RFQ-1',
      });
    });
  });

  describe('submitQuotation', () => {
    const dto = { total_amount: '100.00', currency_code: 'THB', validity_days: 30 };

    it('403 when invitation has no vendor identity', async () => {
      const { service } = build({ invitation: { ...validInvitation, vendor_identity_id: null } });
      await expect(service.submitQuotation('TOK', 'inv-1', dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('403 when no active relationship', async () => {
      const { service } = build({ relationship: null });
      await expect(service.submitQuotation('TOK', 'inv-1', dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('creates the quotation, marks responded, and returns a vendor session', async () => {
      const { service, repo, magicLink } = build();
      const result = await service.submitQuotation('TOK', 'inv-1', dto);
      expect(repo.createQuotation).toHaveBeenCalledWith({
        rfqId: 'rfq-1',
        vendorId: 'ven-1',
        totalAmount: '100.00',
        currencyCode: 'THB',
        validityDays: 30,
      });
      expect(repo.markInvitationResponded).toHaveBeenCalledWith('inv-1');
      expect(magicLink.issueSessionToken).toHaveBeenCalledWith('vid-1');
      expect(result).toEqual({
        quotation: { quotation_id: 'q-1' },
        vendorSession: 'SESSION',
        tenantId: 'ten-1',
      });
    });
  });

  describe('Tier-2 pass-throughs', () => {
    it('listPurchaseOrders', async () => {
      const { service } = build();
      expect(await service.listPurchaseOrders('ven-1')).toEqual([{ po_id: 'po-1' }]);
    });

    it('submitInvoice', async () => {
      const { service, repo } = build();
      const dto = {
        po_id: 'po-1',
        invoice_number: 'INV-1',
        amount: '100.00',
        currency_code: 'THB',
        invoice_date: '2026-06-20',
        due_date: '2026-07-20',
      };
      expect(await service.submitInvoice('ven-1', dto)).toEqual({ invoice_id: 'i-1' });
      expect(repo.findPurchaseOrderForVendor).toHaveBeenCalledWith('po-1', 'ven-1');
      expect(repo.createInvoice).toHaveBeenCalledWith({
        poId: 'po-1',
        vendorId: 'ven-1',
        invoiceNumber: 'INV-1',
        amount: '100.00',
        currencyCode: 'THB',
        invoiceDate: '2026-06-20',
        dueDate: '2026-07-20',
      });
    });

    it('submitInvoice rejects a PO that is not the vendor’s own (object-level authorization)', async () => {
      const { service, repo } = build();
      repo.findPurchaseOrderForVendor.mockResolvedValueOnce(null);
      await expect(
        service.submitInvoice('ven-1', {
          po_id: 'po-belonging-to-another-vendor',
          invoice_number: 'INV-2',
          amount: '50.00',
          currency_code: 'THB',
          invoice_date: '2026-06-20',
          due_date: '2026-07-20',
        }),
      ).rejects.toThrow('Purchase order not found for this vendor');
      expect(repo.createInvoice).not.toHaveBeenCalled();
    });

    it('listInvoices', async () => {
      const { service } = build();
      expect(await service.listInvoices('ven-1')).toEqual([{ invoice_id: 'i-1' }]);
    });

    it('listQuotations', async () => {
      const { service } = build();
      expect(await service.listQuotations('ven-1')).toEqual([{ quotation_id: 'q-1' }]);
    });

    it('listInvitedRfqs', async () => {
      const { service } = build();
      expect(await service.listInvitedRfqs('vid-1')).toEqual([{ rfq_id: 'r-1' }]);
    });
  });

  it('defaults tenantId to empty string when request lacks it', () => {
    const service = new VendorPortalService({} as never, {} as never, {} as never, {});
    expect(service).toBeInstanceOf(VendorPortalService);
    expect((service as unknown as { tenantId: string }).tenantId).toBe('');
  });
});
