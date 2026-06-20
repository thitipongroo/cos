import { UnauthorizedException } from '@nestjs/common';
import { VendorInvitationController, VendorPortalController } from '../vendor-portal.controller';
import { VendorRequest } from '../vendor-auth.middleware';

describe('VendorInvitationController', () => {
  it('maps the body + path param into service.issueInvitation', () => {
    const service = { issueInvitation: jest.fn().mockReturnValue('ok') };
    const controller = new VendorInvitationController(service as never);
    const result = controller.issueInvitation('rfq-1', {
      vendor_id: 'ven-1',
      email: 'a@b.co',
      display_name: 'ACME',
    });
    expect(service.issueInvitation).toHaveBeenCalledWith({
      rfqId: 'rfq-1',
      vendorId: 'ven-1',
      email: 'a@b.co',
      displayName: 'ACME',
    });
    expect(result).toBe('ok');
  });
});

describe('VendorPortalController', () => {
  const service = {
    openRfq: jest.fn().mockReturnValue('rfq'),
    submitQuotation: jest.fn().mockReturnValue('quote'),
    listPurchaseOrders: jest.fn().mockReturnValue('pos'),
    submitInvoice: jest.fn().mockReturnValue('invoice'),
    listInvoices: jest.fn().mockReturnValue('invoices'),
  };
  const controller = new VendorPortalController(service as never);
  const tier1 = { vendorInvitationId: 'inv-1' } as VendorRequest;
  const tier2 = { vendorId: 'ven-1' } as VendorRequest;

  beforeEach(() => jest.clearAllMocks());

  it('openRfq passes the token + invitation context', () => {
    expect(controller.openRfq('TOK', tier1)).toBe('rfq');
    expect(service.openRfq).toHaveBeenCalledWith('TOK', 'inv-1');
  });

  it('submitQuotation passes token + invitation + dto', () => {
    const dto = { total_amount: '1', currency_code: 'THB', validity_days: 30 };
    expect(controller.submitQuotation('TOK', dto, tier1)).toBe('quote');
    expect(service.submitQuotation).toHaveBeenCalledWith('TOK', 'inv-1', dto);
  });

  it('openRfq throws when invitation context is missing', () => {
    expect(() => controller.openRfq('TOK', {} as VendorRequest)).toThrow(UnauthorizedException);
  });

  it('listPurchaseOrders passes the vendor context', () => {
    expect(controller.listPurchaseOrders(tier2)).toBe('pos');
    expect(service.listPurchaseOrders).toHaveBeenCalledWith('ven-1');
  });

  it('submitInvoice passes the vendor context + dto', () => {
    const dto = {
      po_id: 'po-1',
      invoice_number: 'INV-1',
      amount: '1',
      currency_code: 'THB',
      invoice_date: '2026-06-20',
      due_date: '2026-07-20',
    };
    expect(controller.submitInvoice(dto, tier2)).toBe('invoice');
    expect(service.submitInvoice).toHaveBeenCalledWith('ven-1', dto);
  });

  it('listInvoices passes the vendor context', () => {
    expect(controller.listInvoices(tier2)).toBe('invoices');
    expect(service.listInvoices).toHaveBeenCalledWith('ven-1');
  });

  it('vendor endpoints throw when vendor context is missing', () => {
    expect(() => controller.listPurchaseOrders({} as VendorRequest)).toThrow(UnauthorizedException);
  });
});
