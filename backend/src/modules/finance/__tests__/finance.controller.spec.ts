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
  getVarianceReport: jest.fn(),
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
    ctrl.listPayments('p-001', '2', '50');
    expect(mockSvc.listPayments).toHaveBeenCalledWith({ project_id: 'p-001', page: 2, limit: 50 });
  });

  it('listPayments uses query defaults when page/limit omitted', () => {
    ctrl.listPayments();
    expect(mockSvc.listPayments).toHaveBeenCalledWith({
      project_id: undefined,
      page: 1,
      limit: 20,
    });
  });

  it('getVarianceReport delegates to svc.getVarianceReport', () => {
    ctrl.getVarianceReport();
    expect(mockSvc.getVarianceReport).toHaveBeenCalled();
  });
});
