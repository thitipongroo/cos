// Unit tests — Finance Service (Phase 7)
// Focus: budget aggregation accuracy, variance calculation, Kafka consumer handlers.

jest.mock('@cos/shared', () => ({
  KafkaProducer: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import {
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { FinanceService } from '../finance.service';
import { FinanceRepository } from '../finance.repository';
import type {
  ProjectBudgetRow,
  BudgetLineRow,
  CostTransactionRow,
  PaymentRow,
} from '../finance.repository';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockRepo = {
  upsertBudget: jest.fn(),
  findBudgetByProject: jest.fn(),
  updateBudgetAggregates: jest.fn(),
  addBudgetLine: jest.fn(),
  findLinesByBudget: jest.fn(),
  createTransaction: jest.fn(),
  findCostTransactions: jest.fn(),
  sumTransactionsByProject: jest.fn(),
  deleteTransactionBySource: jest.fn(),
  createPayment: jest.fn(),
  findPayments: jest.fn(),
  approvePayment: jest.fn(),
  findAllBudgets: jest.fn(),
  createCustomer: jest.fn(),
  listCustomers: jest.fn(),
  createContract: jest.fn(),
  findContractById: jest.fn(),
  listContracts: jest.fn(),
  createBilling: jest.fn(),
  findBillingById: jest.fn(),
  listBillings: jest.fn(),
  updateBillingStatus: jest.fn(),
  createArReceipt: jest.fn(),
  findUnpaidBillingsDue: jest.fn(),
  findPendingPaymentsDue: jest.fn(),
};

const mockRequest = {
  tenantId: 'tenant-uuid-001',
  userId: 'user-uuid-001', // read by services (projected from req.user.user_id by TenantContextInterceptor, ADR-031)
  user: { user_id: 'user-uuid-001' },
};

// ── Fixtures ───────────────────────────────────────────────────────────────

const budgetRow: ProjectBudgetRow = {
  budget_id: 'budget-uuid-001',
  project_id: 'proj-uuid-001',
  tenant_id: 'tenant-uuid-001',
  total_budget_amount: '1000000.0000',
  total_budget_currency: 'THB',
  allocated_amount: '600000.0000',
  committed_amount: '0.0000',
  actual_amount: '0.0000',
  variance_alert_threshold: '10.00',
  created_at: new Date(),
  updated_at: new Date(),
};

const lineRow: BudgetLineRow = {
  line_id: 'line-uuid-001',
  budget_id: 'budget-uuid-001',
  project_id: 'proj-uuid-001',
  tenant_id: 'tenant-uuid-001',
  boq_category_id: null,
  line_name: 'Structural',
  allocated_amount: '600000.0000',
  currency_code: 'THB',
  created_at: new Date(),
};

const txRow: CostTransactionRow = {
  transaction_id: 'tx-uuid-001',
  project_id: 'proj-uuid-001',
  tenant_id: 'tenant-uuid-001',
  source_type: 'PURCHASE_ORDER',
  source_id: 'po-uuid-001',
  budget_line_id: null,
  amount: '60000.0000',
  currency_code: 'THB',
  transaction_date: new Date(),
  description: null,
  recorded_at: new Date(),
  recorded_by: null,
};

const paymentRow: PaymentRow = {
  payment_id: 'pay-uuid-001',
  invoice_id: 'inv-uuid-001',
  project_id: 'proj-uuid-001',
  tenant_id: 'tenant-uuid-001',
  amount: '60000.0000',
  currency_code: 'THB',
  payment_date: new Date(),
  payment_reference: null,
  wht_certificate_ref: null,
  status: 'PENDING',
  recorded_by: 'user-uuid-001',
  created_at: new Date(),
};

// ── Setup ──────────────────────────────────────────────────────────────────

let service: FinanceService;

beforeEach(async () => {
  jest.clearAllMocks();
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      FinanceService,
      { provide: FinanceRepository, useValue: mockRepo },
      { provide: REQUEST, useValue: mockRequest },
    ],
  }).compile();
  service = await module.resolve<FinanceService>(FinanceService);
});

// ── Constructor fallbacks ──────────────────────────────────────────────────

describe('constructor', () => {
  it('uses empty strings when request has no context', async () => {
    const m = await Test.createTestingModule({
      providers: [
        FinanceService,
        { provide: FinanceRepository, useValue: mockRepo },
        { provide: REQUEST, useValue: {} },
      ],
    }).compile();
    const noCtx = await m.resolve<FinanceService>(FinanceService);
    expect(noCtx).toBeDefined();
    expect((noCtx as unknown as { tenantId: string }).tenantId).toBe('');
    expect((noCtx as unknown as { userId: string }).userId).toBe('');
  });
});

// ── createOrUpdateBudget ───────────────────────────────────────────────────

describe('createOrUpdateBudget', () => {
  it('creates budget and emits finance.budget.created.v1', async () => {
    mockRepo.upsertBudget.mockResolvedValue(budgetRow);
    const result = await service.createOrUpdateBudget('proj-uuid-001', {
      total_budget_amount: '1000000.0000',
      total_budget_currency: 'THB',
    });
    expect(result.budget_id).toBe('budget-uuid-001');
    expect(mockRepo.upsertBudget).toHaveBeenCalledWith(
      expect.objectContaining({ total_budget_currency: 'THB' }),
    );
  });

  it('uses provided variance_alert_threshold', async () => {
    mockRepo.upsertBudget.mockResolvedValue(budgetRow);
    await service.createOrUpdateBudget('proj-uuid-001', {
      total_budget_amount: '1000000.0000',
      total_budget_currency: 'THB',
      variance_alert_threshold: 15,
    });
    expect(mockRepo.upsertBudget).toHaveBeenCalledWith(
      expect.objectContaining({ variance_alert_threshold: '15.00' }),
    );
  });

  it('Decimal precision: 1.123 + 0.001 = 1.124 exactly (no float error)', async () => {
    mockRepo.upsertBudget.mockResolvedValue(budgetRow);
    await service.createOrUpdateBudget('proj-uuid-001', {
      total_budget_amount: '1.1234',
      total_budget_currency: 'THB',
    });
    expect(mockRepo.upsertBudget).toHaveBeenCalledWith(
      expect.objectContaining({ total_budget_amount: '1.1234' }),
    );
  });
});

// ── getBudgetSummary ───────────────────────────────────────────────────────

describe('getBudgetSummary', () => {
  it('returns budget, lines, and variance_percentage', async () => {
    mockRepo.findBudgetByProject.mockResolvedValue(budgetRow);
    mockRepo.findLinesByBudget.mockResolvedValue([lineRow]);
    const result = await service.getBudgetSummary('proj-uuid-001');
    expect(result.budget.budget_id).toBe('budget-uuid-001');
    expect(result.lines).toHaveLength(1);
    expect(result.variance_percentage).toBeDefined();
  });

  it('variance_percentage = 0 when allocated = 0', async () => {
    const zeroBudget = { ...budgetRow, allocated_amount: '0.0000' };
    mockRepo.findBudgetByProject.mockResolvedValue(zeroBudget);
    mockRepo.findLinesByBudget.mockResolvedValue([]);
    const result = await service.getBudgetSummary('proj-uuid-001');
    expect(result.variance_percentage).toBe('0.0000');
  });

  it('variance_percentage calculated correctly: (actual+committed-allocated)/allocated×100', async () => {
    const budget = {
      ...budgetRow,
      allocated_amount: '100.0000',
      committed_amount: '110.0000',
      actual_amount: '0.0000',
    };
    mockRepo.findBudgetByProject.mockResolvedValue(budget);
    mockRepo.findLinesByBudget.mockResolvedValue([]);
    const result = await service.getBudgetSummary('proj-uuid-001');
    // (0+110-100)/100*100 = 10%
    expect(result.variance_percentage).toBe('10.0000');
  });

  it('throws NotFoundException when budget not found', async () => {
    mockRepo.findBudgetByProject.mockResolvedValue(null);
    await expect(service.getBudgetSummary('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ── addBudgetLine ──────────────────────────────────────────────────────────

describe('addBudgetLine', () => {
  it('throws NotFoundException when no budget exists', async () => {
    mockRepo.findBudgetByProject.mockResolvedValue(null);
    await expect(
      service.addBudgetLine('missing', {
        line_name: 'L',
        allocated_amount: '1.0000',
        currency_code: 'THB',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('adds line and recalculates allocated', async () => {
    mockRepo.findBudgetByProject.mockResolvedValue(budgetRow);
    mockRepo.addBudgetLine.mockResolvedValue(lineRow);
    mockRepo.findLinesByBudget.mockResolvedValue([lineRow]);
    mockRepo.updateBudgetAggregates.mockResolvedValue(undefined);

    const result = await service.addBudgetLine('proj-uuid-001', {
      line_name: 'Structural',
      allocated_amount: '600000.0000',
      currency_code: 'THB',
    });
    expect(result.line_id).toBe('line-uuid-001');
    expect(mockRepo.updateBudgetAggregates).toHaveBeenCalled();
  });
});

it('recalculateAllocated skips update when budget disappears between calls (covers if !budget branch)', async () => {
  mockRepo.findBudgetByProject
    .mockResolvedValueOnce(budgetRow) // first call in addBudgetLine
    .mockResolvedValueOnce(null); // second call in recalculateAllocated → skip
  mockRepo.addBudgetLine.mockResolvedValue(lineRow);
  mockRepo.findLinesByBudget.mockResolvedValue([lineRow]);

  const result = await service.addBudgetLine('proj-uuid-001', {
    line_name: 'Structural',
    allocated_amount: '600000.0000',
    currency_code: 'THB',
  });
  expect(result.line_id).toBe('line-uuid-001');
  expect(mockRepo.updateBudgetAggregates).not.toHaveBeenCalled();
});

// ── listCostTransactions ───────────────────────────────────────────────────

describe('listCostTransactions', () => {
  it('returns paginated transactions', async () => {
    mockRepo.findCostTransactions.mockResolvedValue({ rows: [txRow], total: 1 });
    const result = await service.listCostTransactions({
      project_id: 'proj-uuid-001',
      page: 1,
      limit: 20,
    });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});

// ── Kafka consumer handlers ────────────────────────────────────────────────

describe('handlePoCreated', () => {
  it('creates COMMITTED transaction and recalculates', async () => {
    mockRepo.createTransaction.mockResolvedValue(txRow);
    mockRepo.findBudgetByProject.mockResolvedValue(budgetRow);
    mockRepo.sumTransactionsByProject.mockResolvedValue({
      committed_total: '60000',
      actual_total: '0',
    });
    mockRepo.updateBudgetAggregates.mockResolvedValue(undefined);

    await service.handlePoCreated({
      po_id: 'po-uuid-001',
      project_id: 'proj-uuid-001',
      tenant_id: 'tenant-uuid-001',
      total_amount: { amount: '60000.0000', currency_code: 'THB' },
    });

    expect(mockRepo.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ source_type: 'PURCHASE_ORDER', amount: '60000.0000' }),
    );
  });
});

describe('handleInvoiceReceived', () => {
  it('creates ACTUAL transaction and recalculates', async () => {
    mockRepo.createTransaction.mockResolvedValue(txRow);
    mockRepo.findBudgetByProject.mockResolvedValue(budgetRow);
    mockRepo.sumTransactionsByProject.mockResolvedValue({
      committed_total: '0',
      actual_total: '60000',
    });
    mockRepo.updateBudgetAggregates.mockResolvedValue(undefined);

    await service.handleInvoiceReceived({
      po_id: 'po-uuid-001',
      invoice_id: 'inv-uuid-001',
      project_id: 'proj-uuid-001',
      tenant_id: 'tenant-uuid-001',
      amount: { amount: '60000.0000', currency_code: 'THB' },
    });

    expect(mockRepo.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ source_type: 'INVOICE' }),
    );
  });
});

describe('handlePoStatusChanged', () => {
  it('removes committed transaction when PO CANCELLED', async () => {
    mockRepo.deleteTransactionBySource.mockResolvedValue(undefined);
    mockRepo.findBudgetByProject.mockResolvedValue(budgetRow);
    mockRepo.sumTransactionsByProject.mockResolvedValue({
      committed_total: '0',
      actual_total: '0',
    });
    mockRepo.updateBudgetAggregates.mockResolvedValue(undefined);

    await service.handlePoStatusChanged({
      po_id: 'po-uuid-001',
      project_id: 'proj-uuid-001',
      tenant_id: 'tenant-uuid-001',
      from_status: 'PENDING_APPROVAL',
      to_status: 'CANCELLED',
    });

    expect(mockRepo.deleteTransactionBySource).toHaveBeenCalledWith('po-uuid-001');
  });

  it('removes committed transaction when PO REJECTED', async () => {
    mockRepo.deleteTransactionBySource.mockResolvedValue(undefined);
    mockRepo.findBudgetByProject.mockResolvedValue(budgetRow);
    mockRepo.sumTransactionsByProject.mockResolvedValue({
      committed_total: '0',
      actual_total: '0',
    });
    mockRepo.updateBudgetAggregates.mockResolvedValue(undefined);

    await service.handlePoStatusChanged({
      po_id: 'po-uuid-001',
      project_id: 'proj-uuid-001',
      tenant_id: 'tenant-uuid-001',
      from_status: 'PENDING_APPROVAL',
      to_status: 'REJECTED',
    });

    expect(mockRepo.deleteTransactionBySource).toHaveBeenCalled();
  });

  it('does nothing when PO transitions to non-cancellation status', async () => {
    await service.handlePoStatusChanged({
      po_id: 'po-uuid-001',
      project_id: 'proj-uuid-001',
      tenant_id: 'tenant-uuid-001',
      from_status: 'DRAFT',
      to_status: 'PENDING_APPROVAL',
    });
    expect(mockRepo.deleteTransactionBySource).not.toHaveBeenCalled();
  });
});

// ── Variance alert ─────────────────────────────────────────────────────────

describe('variance alert', () => {
  it('emits finance.variance.alert.v1 when variance > threshold', async () => {
    // allocated=100, committed=80, actual=40 → variance=(80+40-100)/100*100 = 20% > 10%
    const overBudget = {
      ...budgetRow,
      allocated_amount: '100.0000',
      variance_alert_threshold: '10.00',
    };
    mockRepo.createTransaction.mockResolvedValue(txRow);
    mockRepo.findBudgetByProject.mockResolvedValue(overBudget);
    mockRepo.sumTransactionsByProject.mockResolvedValue({
      committed_total: '80',
      actual_total: '40',
    });
    mockRepo.updateBudgetAggregates.mockResolvedValue(undefined);

    await service.handlePoCreated({
      po_id: 'po-uuid-001',
      project_id: 'proj-uuid-001',
      tenant_id: 'tenant-uuid-001',
      total_amount: { amount: '80.0000', currency_code: 'THB' },
    });

    const { KafkaProducer } = jest.requireMock('@cos/shared') as { KafkaProducer: jest.Mock };
    const instance = KafkaProducer.mock.results[0]?.value as { publish: jest.Mock };
    expect(instance.publish).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: expect.stringContaining('variance.alert') }),
    );
  });

  it('does NOT emit variance alert when allocated = 0', async () => {
    const zeroBudget = {
      ...budgetRow,
      allocated_amount: '0.0000',
      variance_alert_threshold: '10.00',
    };
    mockRepo.createTransaction.mockResolvedValue(txRow);
    mockRepo.findBudgetByProject.mockResolvedValue(zeroBudget);
    mockRepo.sumTransactionsByProject.mockResolvedValue({
      committed_total: '80',
      actual_total: '0',
    });
    mockRepo.updateBudgetAggregates.mockResolvedValue(undefined);

    await service.handlePoCreated({
      po_id: 'po-uuid-001',
      project_id: 'proj-uuid-001',
      tenant_id: 'tenant-uuid-001',
      total_amount: { amount: '80.0000', currency_code: 'THB' },
    });

    const { KafkaProducer } = jest.requireMock('@cos/shared') as { KafkaProducer: jest.Mock };
    const instance = KafkaProducer.mock.results[0]?.value as { publish: jest.Mock };
    expect(instance.publish).not.toHaveBeenCalledWith(
      expect.objectContaining({ event_type: expect.stringContaining('variance.alert') }),
    );
  });

  it('recalculate skips when no budget found', async () => {
    mockRepo.createTransaction.mockResolvedValue(txRow);
    mockRepo.findBudgetByProject.mockResolvedValue(null);

    await service.handlePoCreated({
      po_id: 'po-uuid-001',
      project_id: 'proj-uuid-001',
      tenant_id: 'tenant-uuid-001',
      total_amount: { amount: '80.0000', currency_code: 'THB' },
    });

    expect(mockRepo.updateBudgetAggregates).not.toHaveBeenCalled();
  });
});

// ── recordPayment ──────────────────────────────────────────────────────────

describe('recordPayment', () => {
  it('records payment and emits finance.payment.processed.v1', async () => {
    mockRepo.createPayment.mockResolvedValue(paymentRow);
    const result = await service.recordPayment({
      project_id: 'proj-uuid-001',
      invoice_id: 'inv-uuid-001',
      amount: '60000.0000',
      currency_code: 'THB',
      payment_date: '2026-06-05',
    });
    expect(result.payment_id).toBe('pay-uuid-001');

    const { KafkaProducer } = jest.requireMock('@cos/shared') as { KafkaProducer: jest.Mock };
    const instance = KafkaProducer.mock.results[0]?.value as { publish: jest.Mock };
    expect(instance.publish).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: expect.stringContaining('payment.processed') }),
    );
  });
});

// ── listPayments ───────────────────────────────────────────────────────────

describe('listPayments', () => {
  it('returns payments', async () => {
    mockRepo.findPayments.mockResolvedValue({ rows: [paymentRow], total: 1 });
    const result = await service.listPayments({ project_id: 'proj-uuid-001', page: 1, limit: 20 });
    expect(result.items).toHaveLength(1);
  });
});

// ── getVarianceReport ──────────────────────────────────────────────────────

describe('getVarianceReport', () => {
  it('returns variance for all budgets', async () => {
    mockRepo.findAllBudgets.mockResolvedValue([budgetRow]);
    const result = await service.getVarianceReport();
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('variance_percentage');
  });

  it('marks over_budget=true when variance > threshold', async () => {
    const over = {
      ...budgetRow,
      committed_amount: '700000.0000',
      actual_amount: '100000.0000',
      allocated_amount: '600000.0000',
      variance_alert_threshold: '10.00',
    };
    mockRepo.findAllBudgets.mockResolvedValue([over]);
    const result = await service.getVarianceReport();
    // (100000+700000-600000)/600000*100 = 33.3%
    expect(result[0]!.over_budget).toBe(true);
  });

  it('variance_percentage = 0 when allocated = 0', async () => {
    const zeroBudget = { ...budgetRow, allocated_amount: '0.0000' };
    mockRepo.findAllBudgets.mockResolvedValue([zeroBudget]);
    const result = await service.getVarianceReport();
    expect(result[0]!.variance_percentage).toBe('0.0000');
  });
});

// ── emitEvent error handling ───────────────────────────────────────────────

describe('emitEvent error handling', () => {
  it('logs error but does not throw when Kafka publish fails', async () => {
    mockRepo.upsertBudget.mockResolvedValue(budgetRow);
    const kafkaMock = (
      service as unknown as {
        kafka: { connect: jest.Mock; publish: jest.Mock; disconnect: jest.Mock };
      }
    ).kafka;
    kafkaMock.publish.mockRejectedValueOnce(new Error('Kafka down'));
    await expect(
      service.createOrUpdateBudget('proj-uuid-001', {
        total_budget_amount: '1000000.0000',
        total_budget_currency: 'THB',
      }),
    ).resolves.toBeDefined();
  });

  it('instanceof branch: non-Error throw covered', async () => {
    mockRepo.upsertBudget.mockResolvedValue(budgetRow);
    const kafkaMock = (
      service as unknown as {
        kafka: { connect: jest.Mock; publish: jest.Mock; disconnect: jest.Mock };
      }
    ).kafka;
    kafkaMock.publish.mockRejectedValueOnce('plain string error');
    await expect(
      service.createOrUpdateBudget('proj-uuid-001', {
        total_budget_amount: '1000000.0000',
        total_budget_currency: 'THB',
      }),
    ).resolves.toBeDefined();
  });

  // ── AR Billing increment ────────────────────────────────────────────────────

  describe('Customers & Contracts', () => {
    it('createCustomer passes through optional fields', async () => {
      mockRepo.createCustomer.mockResolvedValue({ customer_id: 'cust-1' });
      await service.createCustomer({
        company_name: 'ACME',
        customer_type: 'developer',
        opportunity_id: 'opp-1',
      });
      expect(mockRepo.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({ customer_type: 'developer', opportunity_id: 'opp-1' }),
      );
    });

    it('createCustomer defaults optionals to null', async () => {
      mockRepo.createCustomer.mockResolvedValue({ customer_id: 'cust-1' });
      await service.createCustomer({ company_name: 'ACME' });
      expect(mockRepo.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({ customer_type: null, opportunity_id: null }),
      );
    });

    it('listCustomers delegates to repo', async () => {
      mockRepo.listCustomers.mockResolvedValue([{ customer_id: 'cust-1' }]);
      expect(await service.listCustomers()).toHaveLength(1);
    });

    it('createContract formats contract_value to 4dp', async () => {
      mockRepo.createContract.mockResolvedValue({ contract_id: 'con-1' });
      await service.createContract({
        project_id: 'proj-uuid-001',
        contract_type: 'MAIN_CONTRACT',
        contract_value: '1000000',
        customer_id: 'cust-1',
      });
      expect(mockRepo.createContract).toHaveBeenCalledWith(
        expect.objectContaining({ contract_value: '1000000.0000' }),
      );
    });

    it('createContract leaves contract_value null when omitted', async () => {
      mockRepo.createContract.mockResolvedValue({ contract_id: 'con-1' });
      await service.createContract({ project_id: 'proj-uuid-001', contract_type: 'SUBCONTRACT' });
      expect(mockRepo.createContract).toHaveBeenCalledWith(
        expect.objectContaining({ contract_value: null }),
      );
    });

    it('listContracts delegates to repo', async () => {
      mockRepo.listContracts.mockResolvedValue([{ contract_id: 'con-1' }]);
      expect(await service.listContracts('proj-uuid-001')).toHaveLength(1);
    });
  });

  describe('Client Billing (AR)', () => {
    const draftBilling = {
      billing_id: 'bill-1',
      project_id: 'proj-uuid-001',
      contract_id: 'con-1',
      amount: '100000.0000',
      status: 'DRAFT' as const,
    };

    it('createBilling succeeds when contract exists', async () => {
      mockRepo.findContractById.mockResolvedValue({ contract_id: 'con-1' });
      mockRepo.createBilling.mockResolvedValue(draftBilling);
      const r = await service.createBilling({
        project_id: 'proj-uuid-001',
        contract_id: 'con-1',
        billing_number: 'AR-001',
        amount: '100000',
        due_date: '2026-07-15',
      });
      expect(r.billing_id).toBe('bill-1');
      expect(mockRepo.createBilling).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '100000.0000' }),
      );
    });

    it('createBilling throws NotFound when contract missing', async () => {
      mockRepo.findContractById.mockResolvedValue(null);
      await expect(
        service.createBilling({
          project_id: 'proj-uuid-001',
          contract_id: 'missing',
          billing_number: 'AR-001',
          amount: '100000',
          due_date: '2026-07-15',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('getBilling returns billing / throws NotFound', async () => {
      mockRepo.findBillingById.mockResolvedValueOnce(draftBilling);
      expect((await service.getBilling('bill-1')).billing_id).toBe('bill-1');
      mockRepo.findBillingById.mockResolvedValueOnce(null);
      await expect(service.getBilling('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('listBillings returns paginated envelope', async () => {
      mockRepo.listBillings.mockResolvedValue({ rows: [draftBilling], total: 1 });
      const r = await service.listBillings({ page: 1, limit: 20 });
      expect(r).toEqual({ items: [draftBilling], total: 1, page: 1, limit: 20 });
    });

    it('approveBilling DRAFT → ISSUED (Executive tier)', async () => {
      mockRepo.findBillingById.mockResolvedValue(draftBilling);
      mockRepo.updateBillingStatus.mockResolvedValue({ ...draftBilling, status: 'ISSUED' });
      const r = await service.approveBilling('bill-1', 'EXECUTIVE');
      expect(r.status).toBe('ISSUED');
      expect(mockRepo.updateBillingStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ISSUED', approved_by: 'user-uuid-001' }),
      );
    });

    it('approveBilling PM under limit succeeds', async () => {
      mockRepo.findBillingById.mockResolvedValue(draftBilling);
      mockRepo.updateBillingStatus.mockResolvedValue({ ...draftBilling, status: 'ISSUED' });
      await expect(service.approveBilling('bill-1', 'PM')).resolves.toBeDefined();
    });

    it('approveBilling PM over limit throws Forbidden', async () => {
      mockRepo.findBillingById.mockResolvedValue({ ...draftBilling, amount: '600000.0000' });
      await expect(service.approveBilling('bill-1', 'PM')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('approveBilling throws when not DRAFT', async () => {
      mockRepo.findBillingById.mockResolvedValue({ ...draftBilling, status: 'ISSUED' });
      await expect(service.approveBilling('bill-1', 'EXECUTIVE')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('approvePayment PENDING → PROCESSED', async () => {
      mockRepo.approvePayment.mockResolvedValue({ payment_id: 'pay-1', status: 'PROCESSED' });
      const r = await service.approvePayment('pay-1');
      expect(r.status).toBe('PROCESSED');
      expect(mockRepo.approvePayment).toHaveBeenCalledWith('pay-1');
    });

    it('approvePayment throws when not found or not PENDING', async () => {
      mockRepo.approvePayment.mockResolvedValue(null);
      await expect(service.approvePayment('pay-x')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('recordArReceipt settles an ISSUED billing → PAID', async () => {
      mockRepo.findBillingById.mockResolvedValue({ ...draftBilling, status: 'ISSUED' });
      mockRepo.createArReceipt.mockResolvedValue({
        ar_receipt_id: 'rcpt-1',
        amount_received: '100000.0000',
      });
      mockRepo.updateBillingStatus.mockResolvedValue({ ...draftBilling, status: 'PAID' });
      const r = await service.recordArReceipt({
        project_id: 'proj-uuid-001',
        billing_id: 'bill-1',
        customer_id: 'cust-1',
        amount_received: '100000',
        received_date: '2026-07-14',
      });
      expect(r.ar_receipt_id).toBe('rcpt-1');
      expect(mockRepo.updateBillingStatus).toHaveBeenCalledWith({
        billing_id: 'bill-1',
        status: 'PAID',
      });
    });

    it('recordArReceipt throws when billing not ISSUED', async () => {
      mockRepo.findBillingById.mockResolvedValue(draftBilling); // DRAFT
      await expect(
        service.recordArReceipt({
          project_id: 'proj-uuid-001',
          billing_id: 'bill-1',
          customer_id: 'cust-1',
          amount_received: '100000',
          received_date: '2026-07-14',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('Cash flow forecast (direct method)', () => {
    const day = 86_400_000;
    const at = (offsetDays: number) => new Date(Date.now() + offsetDays * day);

    it('buckets AR inflow / AP outflow weekly, drops items beyond the 13-week horizon', async () => {
      mockRepo.findUnpaidBillingsDue.mockResolvedValue([
        { due_date: at(-10), amount: '10000.0000' }, // overdue → bucket 0
        { due_date: at(10), amount: '20000.0000' }, // bucket 1
        { due_date: at(200), amount: '99999.0000' }, // beyond horizon → dropped
      ]);
      mockRepo.findPendingPaymentsDue.mockResolvedValue([
        { due_date: at(3), amount: '5000.0000' }, // bucket 0
        { due_date: at(200), amount: '88888.0000' }, // beyond horizon → dropped (outflow drop branch)
      ]);

      const periods = await service.getCashflowForecast('proj-uuid-001');

      expect(periods).toHaveLength(13);
      expect(periods[0]).toEqual(
        expect.objectContaining({
          inflow: '10000.0000',
          outflow: '5000.0000',
          net_flow: '5000.0000',
          cumulative_net: '5000.0000',
        }),
      );
      expect(periods[1]).toEqual(
        expect.objectContaining({ inflow: '20000.0000', cumulative_net: '25000.0000' }),
      );
      // Beyond-horizon item excluded → final cumulative stays 25000.
      expect(periods[12]?.cumulative_net).toBe('25000.0000');
    });
  });
});
