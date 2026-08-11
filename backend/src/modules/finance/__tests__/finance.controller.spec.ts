// Unit tests — Finance Controller (Phase 7)
jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { FinanceController } from '../finance.controller';

const mockSvc = {
  getBudgetSummary: jest.fn(),
  createOrUpdateBudget: jest.fn(),
  addBudgetLine: jest.fn(),
  listCostTransactions: jest.fn(),
  recordPayment: jest.fn(),
  listPayments: jest.fn(),
  approvePayment: jest.fn(),
  getVarianceReport: jest.fn(),
  createCustomer: jest.fn(),
  listCustomers: jest.fn(),
  createContract: jest.fn(),
  listContracts: jest.fn(),
  attachDocument: jest.fn(),
  signContract: jest.fn(),
  issueSignLink: jest.fn(),
  listContractSignatures: jest.fn(),
  activateContract: jest.fn(),
  terminateContract: jest.fn(),
  createBilling: jest.fn(),
  listBillings: jest.fn(),
  getBilling: jest.fn(),
  approveBilling: jest.fn(),
  recordArReceipt: jest.fn(),
  getCashflowForecast: jest.fn(),
};

describe('FinanceController', () => {
  let ctrl: FinanceController;

  beforeEach(() => {
    jest.clearAllMocks();
    ctrl = new FinanceController(mockSvc as never);
  });

  it('getBudget delegates to svc.getBudgetSummary', () => {
    ctrl.getBudget('p-001');
    expect(mockSvc.getBudgetSummary).toHaveBeenCalledWith('p-001');
  });

  it('approvePayment delegates to svc.approvePayment', () => {
    ctrl.approvePayment('pay-1');
    expect(mockSvc.approvePayment).toHaveBeenCalledWith('pay-1');
  });

  it('createOrUpdateBudget delegates to svc.createOrUpdateBudget', () => {
    const dto = { total_budget_amount: '1000000.0000', total_budget_currency: 'THB' };
    ctrl.createOrUpdateBudget('p-001', dto as never);
    expect(mockSvc.createOrUpdateBudget).toHaveBeenCalledWith('p-001', dto);
  });

  it('addBudgetLine delegates to svc.addBudgetLine', () => {
    const dto = { line_name: 'Structure', allocated_amount: '500000.0000', currency_code: 'THB' };
    ctrl.addBudgetLine('p-001', dto as never);
    expect(mockSvc.addBudgetLine).toHaveBeenCalledWith('p-001', dto);
  });

  it('listTransactions parses params and delegates (tenant-wide, ?project_id=)', () => {
    ctrl.listTransactions('p-001', '2', '50');
    expect(mockSvc.listCostTransactions).toHaveBeenCalledWith({
      project_id: 'p-001',
      page: 2,
      limit: 50,
    });
  });

  it('listTransactions applies defaults on invalid page/limit', () => {
    ctrl.listTransactions(undefined, 'x', 'y');
    expect(mockSvc.listCostTransactions).toHaveBeenCalledWith({
      project_id: undefined,
      page: 1,
      limit: 20,
    });
  });

  it('listTransactions uses query defaults when page/limit omitted', () => {
    ctrl.listTransactions('p-001');
    expect(mockSvc.listCostTransactions).toHaveBeenCalledWith({
      project_id: 'p-001',
      page: 1,
      limit: 20,
    });
  });

  it('recordPayment delegates to svc.recordPayment (project_id in body)', () => {
    const dto = {
      project_id: 'p-001',
      invoice_id: 'inv-001',
      amount: '60000.0000',
      currency_code: 'THB',
      payment_date: '2026-06-05',
    };
    ctrl.recordPayment(dto as never);
    expect(mockSvc.recordPayment).toHaveBeenCalledWith(dto);
  });

  it('listPayments parses params and delegates (tenant-wide AP queue)', () => {
    ctrl.listPayments('p-001', 'PENDING', '2', '50');
    expect(mockSvc.listPayments).toHaveBeenCalledWith({
      project_id: 'p-001',
      status: 'PENDING',
      page: 2,
      limit: 50,
    });
  });

  it('listPayments uses query defaults when status/page/limit omitted', () => {
    ctrl.listPayments();
    expect(mockSvc.listPayments).toHaveBeenCalledWith({
      project_id: undefined,
      status: undefined,
      page: 1,
      limit: 20,
    });
  });

  it('getVarianceReport delegates to svc.getVarianceReport', () => {
    ctrl.getVarianceReport();
    expect(mockSvc.getVarianceReport).toHaveBeenCalled();
  });

  // ── AR Billing increment ────────────────────────────────────────────────────

  it('createCustomer delegates to svc.createCustomer', () => {
    const dto = { company_name: 'ACME' };
    ctrl.createCustomer(dto as never);
    expect(mockSvc.createCustomer).toHaveBeenCalledWith(dto);
  });

  it('listCustomers delegates to svc.listCustomers', () => {
    ctrl.listCustomers();
    expect(mockSvc.listCustomers).toHaveBeenCalled();
  });

  it('createContract delegates to svc.createContract', () => {
    const dto = { project_id: 'p-001', contract_type: 'MAIN_CONTRACT' };
    ctrl.createContract(dto as never);
    expect(mockSvc.createContract).toHaveBeenCalledWith(dto);
  });

  it('listContracts delegates to svc.listContracts', () => {
    ctrl.listContracts('p-001');
    expect(mockSvc.listContracts).toHaveBeenCalledWith('p-001');
  });

  it('attachContractDocument delegates to svc.attachDocument', () => {
    const dto = { mode: 'upload', file_id: 'file-1' };
    ctrl.attachContractDocument('con-1', dto as never);
    expect(mockSvc.attachDocument).toHaveBeenCalledWith('con-1', dto);
  });

  it('signContract delegates to svc.signContract with the client IP', () => {
    ctrl.signContract('con-1', '203.0.113.9');
    expect(mockSvc.signContract).toHaveBeenCalledWith('con-1', '203.0.113.9');
  });

  it('issueContractSignLink delegates to svc.issueSignLink', () => {
    const dto = { client_name: 'ACME', client_email: 'a@acme.com' };
    ctrl.issueContractSignLink('con-1', dto as never);
    expect(mockSvc.issueSignLink).toHaveBeenCalledWith('con-1', dto);
  });

  it('listContractSignatures delegates to svc.listContractSignatures', () => {
    ctrl.listContractSignatures('con-1');
    expect(mockSvc.listContractSignatures).toHaveBeenCalledWith('con-1');
  });

  it('activateContract delegates to svc.activateContract', () => {
    ctrl.activateContract('con-1');
    expect(mockSvc.activateContract).toHaveBeenCalledWith('con-1');
  });

  it('terminateContract delegates to svc.terminateContract', () => {
    ctrl.terminateContract('con-1');
    expect(mockSvc.terminateContract).toHaveBeenCalledWith('con-1');
  });

  it('createBilling delegates to svc.createBilling', () => {
    const dto = {
      project_id: 'p-001',
      contract_id: 'c-1',
      billing_number: 'AR-1',
      amount: '1',
      due_date: '2026-07-15',
    };
    ctrl.createBilling(dto as never);
    expect(mockSvc.createBilling).toHaveBeenCalledWith(dto);
  });

  it('listBillings parses params and delegates', () => {
    ctrl.listBillings('p-001', 'DRAFT', '2', '50');
    expect(mockSvc.listBillings).toHaveBeenCalledWith({
      project_id: 'p-001',
      status: 'DRAFT',
      page: 2,
      limit: 50,
    });
  });

  it('listBillings applies defaults on invalid page/limit', () => {
    ctrl.listBillings(undefined, undefined, 'x', 'y');
    expect(mockSvc.listBillings).toHaveBeenCalledWith({
      project_id: undefined,
      status: undefined,
      page: 1,
      limit: 20,
    });
  });

  it('listBillings uses default page/limit when omitted', () => {
    ctrl.listBillings('p-001', 'DRAFT');
    expect(mockSvc.listBillings).toHaveBeenCalledWith({
      project_id: 'p-001',
      status: 'DRAFT',
      page: 1,
      limit: 20,
    });
  });

  it('getBilling delegates to svc.getBilling', () => {
    ctrl.getBilling('bill-1');
    expect(mockSvc.getBilling).toHaveBeenCalledWith('bill-1');
  });

  it('approveBilling delegates tier to svc.approveBilling', () => {
    ctrl.approveBilling('bill-1', { tier: 'EXECUTIVE' } as never);
    expect(mockSvc.approveBilling).toHaveBeenCalledWith('bill-1', 'EXECUTIVE');
  });

  it('recordArReceipt delegates to svc.recordArReceipt', () => {
    const dto = {
      project_id: 'p-001',
      billing_id: 'b-1',
      customer_id: 'c-1',
      amount_received: '1',
      received_date: '2026-07-14',
    };
    ctrl.recordArReceipt(dto as never);
    expect(mockSvc.recordArReceipt).toHaveBeenCalledWith(dto);
  });

  it('getCashflowForecast delegates to svc.getCashflowForecast', () => {
    ctrl.getCashflowForecast('p-001');
    expect(mockSvc.getCashflowForecast).toHaveBeenCalledWith('p-001');
  });
});
