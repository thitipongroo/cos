// Unit tests — Finance Repository (Phase 7)
import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { FinanceRepository } from '../finance.repository';
import { TenantPrismaService } from '../../tenant/prisma/tenant-prisma.service';

const mockPrisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
const mockTenantPrisma = {
  run: jest.fn((fn: (p: typeof mockPrisma) => unknown) => fn(mockPrisma)),
};
const mockRequest = { tenantId: 'tenant-uuid-001' };

const budgetRow = {
  budget_id: 'budget-uuid-001',
  project_id: 'proj-uuid-001',
  tenant_id: 'tenant-uuid-001',
  total_budget_amount: '1000000.0000',
  total_budget_currency: 'THB',
  allocated_amount: '0.0000',
  committed_amount: '0.0000',
  actual_amount: '0.0000',
  variance_alert_threshold: '10.00',
  created_at: new Date(),
  updated_at: new Date(),
};

const lineRow = {
  line_id: 'line-uuid-001',
  budget_id: 'budget-uuid-001',
  project_id: 'proj-uuid-001',
  tenant_id: 'tenant-uuid-001',
  boq_category_id: null,
  line_name: 'Structural Works',
  allocated_amount: '500000.0000',
  currency_code: 'THB',
  created_at: new Date(),
};

const txRow = {
  transaction_id: 'tx-uuid-001',
  project_id: 'proj-uuid-001',
  tenant_id: 'tenant-uuid-001',
  source_type: 'PURCHASE_ORDER' as const,
  source_id: 'po-uuid-001',
  budget_line_id: null,
  amount: '60000.0000',
  currency_code: 'THB',
  transaction_date: new Date(),
  description: null,
  recorded_at: new Date(),
  recorded_by: null,
};

const paymentRow = {
  payment_id: 'pay-uuid-001',
  invoice_id: 'inv-uuid-001',
  project_id: 'proj-uuid-001',
  tenant_id: 'tenant-uuid-001',
  amount: '60000.0000',
  currency_code: 'THB',
  payment_date: new Date(),
  payment_reference: null,
  status: 'PENDING' as const,
  recorded_by: 'user-uuid-001',
  created_at: new Date(),
};

describe('FinanceRepository', () => {
  let repo: FinanceRepository;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinanceRepository,
        { provide: TenantPrismaService, useValue: mockTenantPrisma },
        { provide: REQUEST, useValue: mockRequest },
      ],
    }).compile();
    repo = await module.resolve<FinanceRepository>(FinanceRepository);
  });

  it('uses empty string tenantId when request has no tenantId', async () => {
    const m = await Test.createTestingModule({
      providers: [
        FinanceRepository,
        { provide: TenantPrismaService, useValue: mockTenantPrisma },
        { provide: REQUEST, useValue: {} },
      ],
    }).compile();
    const r = await m.resolve<FinanceRepository>(FinanceRepository);
    mockPrisma.$queryRaw.mockResolvedValue([]);
    await r.findBudgetByProject('any');
    expect(r).toBeDefined();
  });

  it('upsertBudget returns budget row', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([budgetRow]);
    const result = await repo.upsertBudget({
      project_id: 'proj-uuid-001',
      total_budget_amount: '1000000.0000',
      total_budget_currency: 'THB',
      variance_alert_threshold: '10.00',
    });
    expect(result.budget_id).toBe('budget-uuid-001');
  });

  it('findBudgetByProject returns null when not found', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    expect(await repo.findBudgetByProject('missing')).toBeNull();
  });

  it('findBudgetByProject returns row when found', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([budgetRow]);
    expect((await repo.findBudgetByProject('proj-uuid-001'))?.budget_id).toBe('budget-uuid-001');
  });

  it('updateBudgetAggregates calls $executeRaw', async () => {
    mockPrisma.$executeRaw.mockResolvedValue(1);
    await repo.updateBudgetAggregates({
      budget_id: 'budget-uuid-001',
      committed_amount: '60000.0000',
      actual_amount: '60000.0000',
      allocated_amount: '500000.0000',
    });
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('addBudgetLine returns line row', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([lineRow]);
    const result = await repo.addBudgetLine({
      budget_id: 'budget-uuid-001',
      project_id: 'proj-uuid-001',
      line_name: 'Structural Works',
      allocated_amount: '500000.0000',
      currency_code: 'THB',
    });
    expect(result.line_id).toBe('line-uuid-001');
  });

  it('addBudgetLine with boq_category_id provided', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([lineRow]);
    const result = await repo.addBudgetLine({
      budget_id: 'budget-uuid-001',
      project_id: 'proj-uuid-001',
      line_name: 'BOQ Line',
      allocated_amount: '100000.0000',
      currency_code: 'THB',
      boq_category_id: 'cat-uuid-001',
    });
    expect(result.line_id).toBe('line-uuid-001');
  });

  it('findLinesByBudget returns rows', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([lineRow]);
    const result = await repo.findLinesByBudget('budget-uuid-001');
    expect(result).toHaveLength(1);
  });

  it('createTransaction returns tx row', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([txRow]);
    const result = await repo.createTransaction({
      project_id: 'proj-uuid-001',
      source_type: 'PURCHASE_ORDER',
      source_id: 'po-uuid-001',
      amount: '60000.0000',
      currency_code: 'THB',
      transaction_date: '2026-06-05',
    });
    expect(result.transaction_id).toBe('tx-uuid-001');
  });

  it('createTransaction with budget_line_id provided', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([txRow]);
    const result = await repo.createTransaction({
      project_id: 'proj-uuid-001',
      source_type: 'INVOICE',
      source_id: 'inv-uuid-001',
      amount: '60000.0000',
      currency_code: 'THB',
      transaction_date: '2026-06-05',
      budget_line_id: 'line-uuid-001',
    });
    expect(result.transaction_id).toBe('tx-uuid-001');
  });

  it('findTransactionsByProject returns rows and total', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([txRow]).mockResolvedValueOnce([{ count: 1n }]);
    const result = await repo.findTransactionsByProject('proj-uuid-001', 1, 20);
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('findTransactionsByProject returns total=0 when count empty', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const result = await repo.findTransactionsByProject('proj-uuid-001', 1, 20);
    expect(result.total).toBe(0);
  });

  it('sumTransactionsByProject returns totals', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ committed_total: '60000', actual_total: '0' }]);
    const result = await repo.sumTransactionsByProject('proj-uuid-001');
    expect(result.committed_total).toBe('60000');
  });

  it('sumTransactionsByProject returns zeros when no rows', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    const result = await repo.sumTransactionsByProject('proj-uuid-001');
    expect(result.committed_total).toBe('0');
  });

  it('deleteTransactionBySource calls $executeRaw', async () => {
    mockPrisma.$executeRaw.mockResolvedValue(1);
    await repo.deleteTransactionBySource('po-uuid-001');
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('createPayment returns payment row', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([paymentRow]);
    const result = await repo.createPayment({
      invoice_id: 'inv-uuid-001',
      project_id: 'proj-uuid-001',
      amount: '60000.0000',
      currency_code: 'THB',
      payment_date: '2026-06-05',
      recorded_by: 'user-uuid-001',
    });
    expect(result.payment_id).toBe('pay-uuid-001');
  });

  it('createPayment with payment_reference provided', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([paymentRow]);
    const result = await repo.createPayment({
      invoice_id: 'inv-uuid-001',
      project_id: 'proj-uuid-001',
      amount: '60000.0000',
      currency_code: 'THB',
      payment_date: '2026-06-05',
      recorded_by: 'user-uuid-001',
      payment_reference: 'TRF-12345',
    });
    expect(result.payment_id).toBe('pay-uuid-001');
  });

  it('findPaymentsByProject returns rows', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([paymentRow]);
    const result = await repo.findPaymentsByProject('proj-uuid-001');
    expect(result).toHaveLength(1);
  });

  it('findAllBudgets returns all tenant budgets', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([budgetRow]);
    const result = await repo.findAllBudgets();
    expect(result).toHaveLength(1);
  });
});
