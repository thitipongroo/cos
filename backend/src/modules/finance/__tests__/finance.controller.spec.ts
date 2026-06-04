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

  it('getSummary delegates to svc.getBudgetSummary', () => {
    ctrl.getSummary('p-001');
    expect(mockSvc.getBudgetSummary).toHaveBeenCalledWith('p-001');
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

  it('listTransactions delegates with parsed page/limit', () => {
    ctrl.listTransactions('p-001', 1, 20);
    expect(mockSvc.listCostTransactions).toHaveBeenCalledWith('p-001', 1, 20);
  });

  it('listTransactions clamps limit to 100 max', () => {
    ctrl.listTransactions('p-001', 1, 999);
    expect(mockSvc.listCostTransactions).toHaveBeenCalledWith('p-001', 1, 100);
  });

  it('listTransactions enforces page >= 1', () => {
    ctrl.listTransactions('p-001', 0, 20);
    expect(mockSvc.listCostTransactions).toHaveBeenCalledWith('p-001', 1, 20);
  });

  it('recordPayment delegates to svc.recordPayment', () => {
    const dto = {
      invoice_id: 'inv-001',
      amount: '60000.0000',
      currency_code: 'THB',
      payment_date: '2026-06-05',
    };
    ctrl.recordPayment('p-001', dto as never);
    expect(mockSvc.recordPayment).toHaveBeenCalledWith('p-001', dto);
  });

  it('listPayments delegates to svc.listPayments', () => {
    ctrl.listPayments('p-001');
    expect(mockSvc.listPayments).toHaveBeenCalledWith('p-001');
  });

  it('getVarianceReport delegates to svc.getVarianceReport', () => {
    ctrl.getVarianceReport();
    expect(mockSvc.getVarianceReport).toHaveBeenCalled();
  });
});
