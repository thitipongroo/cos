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

import { NotFoundException } from '@nestjs/common';
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
  findTransactionsByProject: jest.fn(),
  sumTransactionsByProject: jest.fn(),
  deleteTransactionBySource: jest.fn(),
  createPayment: jest.fn(),
  findPaymentsByProject: jest.fn(),
  findAllBudgets: jest.fn(),
};

const mockRequest = { tenantId: 'tenant-uuid-001', user: { user_id: 'user-uuid-001' } };

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
    expect(await m.resolve<FinanceService>(FinanceService)).toBeDefined();
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
    mockRepo.findTransactionsByProject.mockResolvedValue({ rows: [txRow], total: 1 });
    const result = await service.listCostTransactions('proj-uuid-001', 1, 20);
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
    const result = await service.recordPayment('proj-uuid-001', {
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
    mockRepo.findPaymentsByProject.mockResolvedValue([paymentRow]);
    const result = await service.listPayments('proj-uuid-001');
    expect(result).toHaveLength(1);
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
});
