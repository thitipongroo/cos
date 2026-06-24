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
  wht_certificate_ref: null,
  status: 'PENDING' as const,
  recorded_by: 'user-uuid-001',
  created_at: new Date(),
};

const whtRuleRow = {
  rule_id: 'rule-uuid-001',
  tenant_id: 'tenant-uuid-001',
  jurisdiction_code: 'TH',
  service_type: 'services',
  rate: '3.00',
  is_active: true,
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

  it('findCostTransactions returns rows and total (with project filter)', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([txRow]).mockResolvedValueOnce([{ count: 1n }]);
    const result = await repo.findCostTransactions({
      project_id: 'proj-uuid-001',
      page: 1,
      limit: 20,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('findCostTransactions returns total=0 when count empty (no project filter)', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const result = await repo.findCostTransactions({ page: 1, limit: 20 });
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

  it('findPayments returns rows and total (with project filter)', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([paymentRow]).mockResolvedValueOnce([{ count: 1n }]);
    const result = await repo.findPayments({ project_id: 'proj-uuid-001', page: 1, limit: 20 });
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('findPayments returns total=0 when count empty (no project filter)', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const result = await repo.findPayments({ page: 1, limit: 20 });
    expect(result.total).toBe(0);
  });

  it('findAllBudgets returns all tenant budgets', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([budgetRow]);
    const result = await repo.findAllBudgets();
    expect(result).toHaveLength(1);
  });

  it('findWhtRule returns matching rule', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([whtRuleRow]);
    const result = await repo.findWhtRule('TH', 'services');
    expect(result?.rule_id).toBe('rule-uuid-001');
    expect(result?.rate).toBe('3.00');
  });

  it('findWhtRule returns null when no rule found', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    const result = await repo.findWhtRule('TH', 'unknown-type');
    expect(result).toBeNull();
  });

  // ── AR Billing increment ────────────────────────────────────────────────────

  const customerRow = { customer_id: 'cust-1', tenant_id: 'tenant-uuid-001' };
  const contractRow = { contract_id: 'con-1', tenant_id: 'tenant-uuid-001' };
  const billingRow = { billing_id: 'bill-1', tenant_id: 'tenant-uuid-001', status: 'DRAFT' };
  const arReceiptRow = { ar_receipt_id: 'rcpt-1', tenant_id: 'tenant-uuid-001' };

  it('createCustomer with optional fields provided', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([customerRow]);
    const r = await repo.createCustomer({
      company_name: 'ACME',
      customer_type: 'developer',
      opportunity_id: 'opp-1',
    });
    expect(r.customer_id).toBe('cust-1');
  });

  it('createCustomer with optionals omitted (null branch)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([customerRow]);
    const r = await repo.createCustomer({ company_name: 'ACME' });
    expect(r.customer_id).toBe('cust-1');
  });

  it('findCustomerById returns row then null', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([customerRow]);
    expect((await repo.findCustomerById('cust-1'))?.customer_id).toBe('cust-1');
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    expect(await repo.findCustomerById('missing')).toBeNull();
  });

  it('listCustomers returns rows', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([customerRow]);
    expect(await repo.listCustomers()).toHaveLength(1);
  });

  it('createContract with optional fields provided', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([contractRow]);
    const r = await repo.createContract({
      project_id: 'proj-uuid-001',
      contract_type: 'MAIN_CONTRACT',
      contract_value: '1000000.0000',
      customer_id: 'cust-1',
      vendor_id: null,
    });
    expect(r.contract_id).toBe('con-1');
  });

  it('createContract with optionals omitted (null branch)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([contractRow]);
    const r = await repo.createContract({
      project_id: 'proj-uuid-001',
      contract_type: 'SUBCONTRACT',
    });
    expect(r.contract_id).toBe('con-1');
  });

  it('findContractById returns row then null', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([contractRow]);
    expect((await repo.findContractById('con-1'))?.contract_id).toBe('con-1');
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    expect(await repo.findContractById('missing')).toBeNull();
  });

  it('listContracts with and without project filter', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([contractRow]);
    expect(await repo.listContracts('proj-uuid-001')).toHaveLength(1);
    expect(await repo.listContracts()).toHaveLength(1);
  });

  it('createBilling returns billing row', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([billingRow]);
    const r = await repo.createBilling({
      project_id: 'proj-uuid-001',
      contract_id: 'con-1',
      billing_number: 'AR-001',
      amount: '50000.0000',
      due_date: '2026-07-15',
    });
    expect(r.billing_id).toBe('bill-1');
  });

  it('findBillingById returns row then null', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([billingRow]);
    expect((await repo.findBillingById('bill-1'))?.billing_id).toBe('bill-1');
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    expect(await repo.findBillingById('missing')).toBeNull();
  });

  it('listBillings returns rows and total (filters applied)', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([billingRow]).mockResolvedValueOnce([{ count: 1n }]);
    const r = await repo.listBillings({
      project_id: 'proj-uuid-001',
      status: 'DRAFT',
      page: 1,
      limit: 20,
    });
    expect(r.total).toBe(1);
  });

  it('listBillings returns total=0 when count empty (no filters)', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const r = await repo.listBillings({ page: 1, limit: 20 });
    expect(r.total).toBe(0);
  });

  it('updateBillingStatus to ISSUED with approver', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ ...billingRow, status: 'ISSUED' }]);
    const r = await repo.updateBillingStatus({
      billing_id: 'bill-1',
      status: 'ISSUED',
      approved_by: 'user-1',
    });
    expect(r.status).toBe('ISSUED');
  });

  it('updateBillingStatus to PAID without approver (null branch)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ ...billingRow, status: 'PAID' }]);
    const r = await repo.updateBillingStatus({ billing_id: 'bill-1', status: 'PAID' });
    expect(r.status).toBe('PAID');
  });

  it('approvePayment returns the updated row (PENDING → PROCESSED)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ payment_id: 'pay-1', status: 'PROCESSED' }]);
    const r = await repo.approvePayment('pay-1');
    expect(r?.status).toBe('PROCESSED');
  });

  it('approvePayment returns null when not found / not pending', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    expect(await repo.approvePayment('pay-x')).toBeNull();
  });

  it('createArReceipt with optional fields provided', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([arReceiptRow]);
    const r = await repo.createArReceipt({
      project_id: 'proj-uuid-001',
      billing_id: 'bill-1',
      customer_id: 'cust-1',
      amount_received: '50000.0000',
      received_date: '2026-07-14',
      payment_method: 'transfer',
      payment_reference: 'TXN-1',
      received_by: 'user-1',
    });
    expect(r.ar_receipt_id).toBe('rcpt-1');
  });

  it('createArReceipt with optionals omitted (null branch)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([arReceiptRow]);
    const r = await repo.createArReceipt({
      project_id: 'proj-uuid-001',
      billing_id: 'bill-1',
      customer_id: 'cust-1',
      amount_received: '50000.0000',
      received_date: '2026-07-14',
      received_by: 'user-1',
    });
    expect(r.ar_receipt_id).toBe('rcpt-1');
  });

  it('findUnpaidBillingsDue returns dated amounts', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ due_date: new Date(), amount: '50000.0000' }]);
    expect(await repo.findUnpaidBillingsDue('proj-uuid-001')).toHaveLength(1);
  });

  it('findPendingPaymentsDue returns dated amounts', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ due_date: new Date(), amount: '20000.0000' }]);
    expect(await repo.findPendingPaymentsDue('proj-uuid-001')).toHaveLength(1);
  });
});
