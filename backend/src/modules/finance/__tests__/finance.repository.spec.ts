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

  it('findPayments returns rows and total (with project + status filter)', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([paymentRow]).mockResolvedValueOnce([{ count: 1n }]);
    const result = await repo.findPayments({
      project_id: 'proj-uuid-001',
      status: 'PENDING',
      page: 1,
      limit: 20,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('findPayments returns total=0 when count empty (no project/status filter)', async () => {
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
      terms: 'Net 30; retention 5%',
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

  it('updateContractStatus updates and returns the row', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ ...contractRow, status: 'ACTIVE' }]);
    const r = await repo.updateContractStatus('con-1', 'ACTIVE');
    expect(r.status).toBe('ACTIVE');
  });

  it('attachSignedDocument binds the document and returns the row', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ ...contractRow, signed_document_id: 'file-1' }]);
    const r = await repo.attachSignedDocument('con-1', 'file-1');
    expect(r.signed_document_id).toBe('file-1');
  });

  it('replaceBoqSnapshot deletes then re-inserts each line (ADR-058 CT-2c-2)', async () => {
    mockPrisma.$executeRaw.mockResolvedValue(1);
    await repo.replaceBoqSnapshot('ver-1', 'proj-1', [
      {
        item_code: 'A-1',
        description: 'Concrete',
        unit: 'm3',
        quantity: '10.0000',
        unit_cost: '2500.0000',
        estimated_total: '25000.0000',
      },
      {
        item_code: null,
        description: 'Steel',
        unit: 'kg',
        quantity: '5.0000',
        unit_cost: '30.0000',
        estimated_total: '150.0000',
      },
    ]);
    // 1 DELETE + 2 INSERTs
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(3);
  });

  it('findBoqSnapshotByProject returns the latest version lines (ADR-058 CT-2c-3)', async () => {
    const rows = [
      {
        item_code: 'A-1',
        description: 'Concrete',
        unit: 'm3',
        quantity: '10.0000',
        unit_cost: '2500.0000',
        estimated_total: '25000.0000',
      },
    ];
    mockPrisma.$queryRaw.mockResolvedValue(rows);
    expect(await repo.findBoqSnapshotByProject('proj-1')).toHaveLength(1);
  });

  it('recordContractSignature inserts and returns the signature (ADR-058 CT-3)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { signature_id: 'sig-1', verification_status: 'VERIFIED' },
    ]);
    const r = await repo.recordContractSignature({
      contract_id: 'con-1',
      signer_party: 'INTERNAL',
      signer_identity: { userId: 'u-1' },
      credential_ref: 'vc-1',
      document_hash: 'a'.repeat(64),
      ip_address: '203.0.113.5',
      verification_status: 'VERIFIED',
    });
    expect(r.signature_id).toBe('sig-1');
  });

  it('createSignToken inserts a token row (with + without client info) (ADR-058 CT-4)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ token_id: 'tk-1' }]);
    const withInfo = await repo.createSignToken({
      contract_id: 'con-1',
      token_hash: 'h'.repeat(64),
      invited_name: 'ACME',
      invited_email: 'a@acme.com',
      expires_at: new Date('2026-08-01'),
    });
    expect(withInfo.token_id).toBe('tk-1');
    // null branches for invited_name/email
    const noInfo = await repo.createSignToken({
      contract_id: 'con-1',
      token_hash: 'h'.repeat(64),
      expires_at: new Date(),
    });
    expect(noInfo.token_id).toBe('tk-1');
  });

  it('consumeSignToken returns the token it consumed, then null (ADR-058 CT-5)', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ token_id: 'tk-1', contract_id: 'con-1' }]);
    expect((await repo.consumeSignToken('h'.repeat(64)))?.token_id).toBe('tk-1');
    // Second call: the UPDATE's `used_at IS NULL` predicate no longer matches, so it returns no rows.
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    expect(await repo.consumeSignToken('h'.repeat(64))).toBeNull();
  });

  it('consumeSignToken consumes in a single statement, not read-then-write (ADR-058 CT-5)', async () => {
    // The single-use guarantee rests on the check and the write being ONE statement: a
    // SELECT followed by a later UPDATE let two concurrent signers both pass the check.
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ token_id: 'tk-1', contract_id: 'con-1' }]);
    await repo.consumeSignToken('h'.repeat(64));

    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    const sql = mockPrisma.$queryRaw.mock.calls[0][0].join('?');
    expect(sql).toMatch(/UPDATE\s+finance\.contract_sign_tokens/);
    expect(sql).toContain('used_at IS NULL');
    expect(sql).toContain('RETURNING');
  });

  it('listContractSignatures returns the trail (ADR-058 CT-6)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ signature_id: 'sig-1' }, { signature_id: 'sig-2' }]);
    expect(await repo.listContractSignatures('con-1')).toHaveLength(2);
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

  // Phase 8 Outbox Pattern (§35.13 ESC-13): the outbox row goes through the SAME tx handle as
  // the business write, and the builder is skipped whenever there is no row to build from.
  describe('outbox writes', () => {
    const envelope = {
      event_type: 'finance.budget.created.v1',
      event_version: '1.0',
      tenant_id: 'tenant-uuid-001',
      actor_id: 'user-uuid-001',
      occurred_at: '2026-08-22T00:00:00.000Z',
      correlation_id: 'corr-1',
      payload: { budget_id: 'budget-uuid-001' },
    };

    const upsertParams = {
      project_id: 'proj-uuid-001',
      total_budget_amount: '1000000.0000',
      total_budget_currency: 'THB',
      variance_alert_threshold: '10.00',
    };

    const paymentParams = {
      invoice_id: 'inv-uuid-001',
      project_id: 'proj-uuid-001',
      amount: '1000.0000',
      currency_code: 'THB',
      payment_date: '2026-06-08',
      recorded_by: 'user-uuid-001',
    };

    it('upsertBudget writes the outbox row from the upserted row', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([budgetRow]);
      const builder = jest.fn(() => envelope);
      await repo.upsertBudget(upsertParams, builder as never);
      expect(builder).toHaveBeenCalledWith(budgetRow);
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('upsertBudget writes nothing without a builder', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([budgetRow]);
      await repo.upsertBudget(upsertParams);
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('createPayment writes the outbox row from the inserted row', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ payment_id: 'pay-1' }]);
      const builder = jest.fn(() => envelope);
      await repo.createPayment(paymentParams, builder as never);
      expect(builder).toHaveBeenCalledWith({ payment_id: 'pay-1' });
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('createPayment writes nothing without a builder', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ payment_id: 'pay-1' }]);
      await repo.createPayment(paymentParams);
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('updateBillingStatus writes the outbox row from the updated row', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ billing_id: 'bill-1' }]);
      const builder = jest.fn(() => envelope);
      await repo.updateBillingStatus({ billing_id: 'bill-1', status: 'PAID' }, builder as never);
      expect(builder).toHaveBeenCalledWith({ billing_id: 'bill-1' });
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('updateBillingStatus writes nothing when the UPDATE matched no row', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      const builder = jest.fn();
      await repo.updateBillingStatus({ billing_id: 'missing', status: 'PAID' }, builder as never);
      expect(builder).not.toHaveBeenCalled();
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('updateBudgetAggregates writes the variance alert in the same transaction', async () => {
      await repo.updateBudgetAggregates(
        {
          budget_id: 'budget-uuid-001',
          committed_amount: '0.0000',
          actual_amount: '0.0000',
          allocated_amount: '0.0000',
        },
        { ...envelope, event_type: 'finance.variance.alert.v1' } as never,
      );
      // one $executeRaw for the UPDATE, one for the outbox row — same tx handle
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2);
      expect(mockTenantPrisma.run).toHaveBeenCalledTimes(1);
    });

    it('updateBudgetAggregates writes nothing without an event', async () => {
      await repo.updateBudgetAggregates({
        budget_id: 'budget-uuid-001',
        committed_amount: '0.0000',
        actual_amount: '0.0000',
        allocated_amount: '0.0000',
      });
      // one $executeRaw for the UPDATE itself, none for an outbox row
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });

  // Budget-line attribution — what decides whether finance.budget.exceeded.v1 can fire for an
  // order at all. The rule is deliberately all-or-nothing: a PO is attributed to ONE budget line or
  // to none, because the ledger has no way to hold a split and half an order charged to a line is a
  // number nobody can reconcile.
  describe('resolveBudgetLine', () => {
    it('returns null for an order with no BOQ items, without querying', async () => {
      await expect(repo.resolveBudgetLine('proj-uuid-001', [])).resolves.toBeNull();
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('returns the line when it accounts for every item on the order', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ line_id: 'line-1', matched_count: 2n }]);
      await expect(repo.resolveBudgetLine('proj-uuid-001', ['item-1', 'item-2'])).resolves.toBe(
        'line-1',
      );
    });

    it('returns null when the order spans two budget lines', async () => {
      // The split case. Attributing the whole order to whichever line came back first would
      // overstate that line and understate the other, and the alert would name the wrong trade.
      mockPrisma.$queryRaw.mockResolvedValue([
        { line_id: 'line-1', matched_count: 1n },
        { line_id: 'line-2', matched_count: 1n },
      ]);
      await expect(
        repo.resolveBudgetLine('proj-uuid-001', ['item-1', 'item-2']),
      ).resolves.toBeNull();
    });

    it('returns null when one line matched only SOME of the items', async () => {
      // The rest of the order belongs to categories with no budget line at all, so charging the
      // whole thing here would attribute spending the line never allocated for.
      mockPrisma.$queryRaw.mockResolvedValue([{ line_id: 'line-1', matched_count: 1n }]);
      await expect(
        repo.resolveBudgetLine('proj-uuid-001', ['item-1', 'item-2']),
      ).resolves.toBeNull();
    });

    it('returns null when no line matched', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      await expect(repo.resolveBudgetLine('proj-uuid-001', ['item-1'])).resolves.toBeNull();
    });
  });

  describe('getBudgetLineTotals', () => {
    it('returns the line with its allocation and everything charged to it', async () => {
      // Committed and actual are summed together: a PO raised but not yet invoiced has already
      // consumed the budget as far as anyone planning against it is concerned.
      const row = {
        line_id: 'line-1',
        boq_category_id: 'cat-1',
        category_code: 'CONCRETE',
        allocated_amount: '100000.0000',
        charged_amount: '120000.0000',
        currency_code: 'THB',
      };
      mockPrisma.$queryRaw.mockResolvedValue([row]);
      await expect(repo.getBudgetLineTotals('line-1')).resolves.toEqual(row);
    });

    it('returns null for a line in another tenant', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      await expect(repo.getBudgetLineTotals('line-other')).resolves.toBeNull();
    });
  });
});
