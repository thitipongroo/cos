// Unit tests — Procurement Controller (Phase 5)
// Verifies delegation to ProcurementService with correct arguments.

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { ProcurementController } from '../procurement.controller';

const mockSvc = {
  createVendor: jest.fn(),
  listVendors: jest.fn(),
  getVendor: jest.fn(),
  deactivateVendor: jest.fn(),
  createPurchaseRequest: jest.fn(),
  listPurchaseRequests: jest.fn(),
  createRfq: jest.fn(),
  listRfqs: jest.fn(),
  publishRfq: jest.fn(),
  closeRfq: jest.fn(),
  cancelRfq: jest.fn(),
  compareQuotations: jest.fn(),
  submitQuotation: jest.fn(),
  awardRfq: jest.fn(),
  createPurchaseOrder: jest.fn(),
  listPurchaseOrders: jest.fn(),
  getPurchaseOrder: jest.fn(),
  submitPoForApproval: jest.fn(),
  approvePo: jest.fn(),
  rejectPo: jest.fn(),
  acknowledgePo: jest.fn(),
  recordDelivery: jest.fn(),
  receiveInvoice: jest.fn(),
  listInvoicesByPo: jest.fn(),
  approveInvoice: jest.fn(),
  markInvoicePaid: jest.fn(),
  disputeInvoice: jest.fn(),
};

describe('ProcurementController', () => {
  let ctrl: ProcurementController;

  beforeEach(() => {
    jest.clearAllMocks();
    ctrl = new ProcurementController(mockSvc as never);
  });

  it('createVendor delegates to svc.createVendor', () => {
    const dto = { vendor_code: 'V001', vendor_name: 'Test' };
    ctrl.createVendor(dto as never);
    expect(mockSvc.createVendor).toHaveBeenCalledWith(dto);
  });

  it('listVendors delegates — active_only defaults to true', () => {
    ctrl.listVendors(undefined);
    expect(mockSvc.listVendors).toHaveBeenCalledWith(true);
  });

  it('listVendors delegates — active_only=false when query is "false"', () => {
    ctrl.listVendors('false');
    expect(mockSvc.listVendors).toHaveBeenCalledWith(false);
  });

  it('listVendors delegates — active_only=true when query is "true"', () => {
    ctrl.listVendors('true');
    expect(mockSvc.listVendors).toHaveBeenCalledWith(true);
  });

  it('getVendor delegates to svc.getVendor', () => {
    ctrl.getVendor('v-001');
    expect(mockSvc.getVendor).toHaveBeenCalledWith('v-001');
  });

  it('deactivateVendor delegates to svc.deactivateVendor', () => {
    ctrl.deactivateVendor('v-001');
    expect(mockSvc.deactivateVendor).toHaveBeenCalledWith('v-001');
  });

  it('createPurchaseRequest delegates to svc.createPurchaseRequest', () => {
    const dto = { project_id: 'p-001', pr_number: 'PR-001' };
    ctrl.createPurchaseRequest('p-001', dto as never);
    expect(mockSvc.createPurchaseRequest).toHaveBeenCalledWith(dto);
  });

  it('listPurchaseRequests delegates to svc.listPurchaseRequests', () => {
    ctrl.listPurchaseRequests('p-001');
    expect(mockSvc.listPurchaseRequests).toHaveBeenCalledWith('p-001');
  });

  it('createRfq delegates to svc.createRfq', () => {
    const dto = { project_id: 'p-001', rfq_number: 'R-001', deadline: '2026-12-31T00:00:00Z' };
    ctrl.createRfq(dto as never);
    expect(mockSvc.createRfq).toHaveBeenCalledWith(dto);
  });

  it('listRfqs delegates to svc.listRfqs', () => {
    ctrl.listRfqs('p-001');
    expect(mockSvc.listRfqs).toHaveBeenCalledWith('p-001');
  });

  it('publishRfq delegates to svc.publishRfq', () => {
    ctrl.publishRfq('rfq-001');
    expect(mockSvc.publishRfq).toHaveBeenCalledWith('rfq-001');
  });

  it('closeRfq delegates to svc.closeRfq', () => {
    ctrl.closeRfq('rfq-001');
    expect(mockSvc.closeRfq).toHaveBeenCalledWith('rfq-001');
  });

  it('cancelRfq delegates to svc.cancelRfq', () => {
    ctrl.cancelRfq('rfq-001');
    expect(mockSvc.cancelRfq).toHaveBeenCalledWith('rfq-001');
  });

  it('compareQuotations delegates to svc.compareQuotations', () => {
    ctrl.compareQuotations('rfq-001');
    expect(mockSvc.compareQuotations).toHaveBeenCalledWith('rfq-001');
  });

  it('submitQuotation delegates to svc.submitQuotation', () => {
    const dto = {
      vendor_id: 'v-001',
      total_amount: '1000.0000',
      currency_code: 'THB',
      validity_days: 30,
      submitted_at: '2026-09-01T00:00:00Z',
    };
    ctrl.submitQuotation('rfq-001', dto as never);
    expect(mockSvc.submitQuotation).toHaveBeenCalledWith('rfq-001', dto);
  });

  it('awardRfq delegates to svc.awardRfq', () => {
    ctrl.awardRfq('rfq-001', { quotation_id: 'q-001' });
    expect(mockSvc.awardRfq).toHaveBeenCalledWith('rfq-001', 'q-001');
  });

  it('createPurchaseOrder delegates to svc.createPurchaseOrder', () => {
    const dto = {
      vendor_id: 'v-001',
      project_id: 'p-001',
      po_number: 'PO-001',
      total_amount: '1000.0000',
      currency_code: 'THB',
      delivery_date: '2026-12-31',
      line_items: [],
    };
    ctrl.createPurchaseOrder(dto as never);
    expect(mockSvc.createPurchaseOrder).toHaveBeenCalledWith(dto);
  });

  it('listPurchaseOrders delegates to svc.listPurchaseOrders', () => {
    ctrl.listPurchaseOrders('p-001');
    expect(mockSvc.listPurchaseOrders).toHaveBeenCalledWith('p-001');
  });

  it('getPurchaseOrder delegates to svc.getPurchaseOrder', () => {
    ctrl.getPurchaseOrder('po-001');
    expect(mockSvc.getPurchaseOrder).toHaveBeenCalledWith('po-001');
  });

  it('submitPoForApproval delegates to svc.submitPoForApproval', () => {
    ctrl.submitPoForApproval('po-001');
    expect(mockSvc.submitPoForApproval).toHaveBeenCalledWith('po-001');
  });

  it('approvePo delegates to svc.approvePo', () => {
    ctrl.approvePo('po-001', { tier: 'PM' });
    expect(mockSvc.approvePo).toHaveBeenCalledWith('po-001', 'PM');
  });

  it('rejectPo delegates to svc.rejectPo', () => {
    ctrl.rejectPo('po-001', { reason: 'Too expensive' });
    expect(mockSvc.rejectPo).toHaveBeenCalledWith('po-001', 'Too expensive');
  });

  it('acknowledgePo delegates to svc.acknowledgePo', () => {
    ctrl.acknowledgePo('po-001');
    expect(mockSvc.acknowledgePo).toHaveBeenCalledWith('po-001');
  });

  it('recordDelivery delegates to svc.recordDelivery', () => {
    const dto = { delivered_at: '2026-09-01T00:00:00Z', items: [] };
    ctrl.recordDelivery('po-001', dto as never);
    expect(mockSvc.recordDelivery).toHaveBeenCalledWith('po-001', dto);
  });

  it('receiveInvoice delegates to svc.receiveInvoice', () => {
    const dto = {
      invoice_number: 'INV-001',
      amount: '1000.0000',
      currency_code: 'THB',
      invoice_date: '2026-09-05',
      due_date: '2026-09-20',
    };
    ctrl.receiveInvoice('po-001', dto as never);
    expect(mockSvc.receiveInvoice).toHaveBeenCalledWith('po-001', dto);
  });

  it('listInvoices delegates to svc.listInvoicesByPo', () => {
    ctrl.listInvoices('po-001');
    expect(mockSvc.listInvoicesByPo).toHaveBeenCalledWith('po-001');
  });

  it('approveInvoice delegates to svc.approveInvoice', () => {
    ctrl.approveInvoice('po-001', 'inv-001');
    expect(mockSvc.approveInvoice).toHaveBeenCalledWith('po-001', 'inv-001');
  });

  it('markInvoicePaid delegates to svc.markInvoicePaid', () => {
    ctrl.markInvoicePaid('po-001');
    expect(mockSvc.markInvoicePaid).toHaveBeenCalledWith('po-001');
  });

  it('disputeInvoice delegates to svc.disputeInvoice', () => {
    ctrl.disputeInvoice('po-001', { reason: 'Incorrect amount' });
    expect(mockSvc.disputeInvoice).toHaveBeenCalledWith('po-001', 'Incorrect amount');
  });
});
