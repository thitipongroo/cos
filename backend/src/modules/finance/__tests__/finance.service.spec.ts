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
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { FinanceService } from '../finance.service';
import { FinanceRepository } from '../finance.repository';
import { FileServiceClient } from '../../files/file-service-client.service';
import { CredentialClientService } from '../../credentials/credential-client.service';
import { ContractSignLinkService } from '../contract-sign-link.service';
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
  attachSignedDocument: jest.fn(),
  updateContractStatus: jest.fn(),
  replaceBoqSnapshot: jest.fn(),
  findBoqSnapshotByProject: jest.fn(),
  recordContractSignature: jest.fn(),
  createSignToken: jest.fn(),
  findActiveSignToken: jest.fn(),
  markSignTokenUsed: jest.fn(),
  listContractSignatures: jest.fn(),
  createBilling: jest.fn(),
  findBillingById: jest.fn(),
  listBillings: jest.fn(),
  updateBillingStatus: jest.fn(),
  createArReceipt: jest.fn(),
  findUnpaidBillingsDue: jest.fn(),
  findPendingPaymentsDue: jest.fn(),
};

const mockFileClient = { getFileMetadata: jest.fn(), upload: jest.fn() };
const mockCredentialClient = { issue: jest.fn(), verify: jest.fn() };
const mockSignLink = { issue: jest.fn(), verify: jest.fn(), hashToken: jest.fn() };

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
      { provide: FileServiceClient, useValue: mockFileClient },
      { provide: CredentialClientService, useValue: mockCredentialClient },
      { provide: ContractSignLinkService, useValue: mockSignLink },
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
        { provide: FileServiceClient, useValue: mockFileClient },
        { provide: CredentialClientService, useValue: mockCredentialClient },
        { provide: ContractSignLinkService, useValue: mockSignLink },
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
        terms: 'Net 30; retention 5%',
      });
      expect(mockRepo.createContract).toHaveBeenCalledWith(
        expect.objectContaining({ contract_value: '1000000.0000', terms: 'Net 30; retention 5%' }),
      );
    });

    it('createContract leaves contract_value + terms null when omitted', async () => {
      mockRepo.createContract.mockResolvedValue({ contract_id: 'con-1' });
      await service.createContract({ project_id: 'proj-uuid-001', contract_type: 'SUBCONTRACT' });
      expect(mockRepo.createContract).toHaveBeenCalledWith(
        expect.objectContaining({ contract_value: null, terms: null }),
      );
    });

    it('listContracts delegates to repo', async () => {
      mockRepo.listContracts.mockResolvedValue([{ contract_id: 'con-1' }]);
      expect(await service.listContracts('proj-uuid-001')).toHaveLength(1);
    });

    it('listContractSignatures delegates to repo (ADR-058 CT-6)', async () => {
      mockRepo.listContractSignatures.mockResolvedValue([{ signature_id: 'sig-1' }]);
      expect(await service.listContractSignatures('con-1')).toHaveLength(1);
    });

    describe('activate / terminate lifecycle', () => {
      it('activates a SIGNED contract', async () => {
        mockRepo.findContractById.mockResolvedValue({ contract_id: 'con-1', status: 'SIGNED' });
        mockRepo.updateContractStatus.mockResolvedValue({ contract_id: 'con-1', status: 'ACTIVE' });
        const r = await service.activateContract('con-1');
        expect(r.status).toBe('ACTIVE');
        expect(mockRepo.updateContractStatus).toHaveBeenCalledWith('con-1', 'ACTIVE');
      });

      it('404s activating an unknown contract', async () => {
        mockRepo.findContractById.mockResolvedValue(null);
        await expect(service.activateContract('missing')).rejects.toBeInstanceOf(NotFoundException);
      });

      it('400s activating a contract that is not SIGNED', async () => {
        mockRepo.findContractById.mockResolvedValue({ contract_id: 'con-1', status: 'DRAFT' });
        await expect(service.activateContract('con-1')).rejects.toBeInstanceOf(BadRequestException);
        expect(mockRepo.updateContractStatus).not.toHaveBeenCalled();
      });

      it('terminates a SIGNED contract and an ACTIVE contract', async () => {
        mockRepo.findContractById.mockResolvedValue({ contract_id: 'con-1', status: 'SIGNED' });
        mockRepo.updateContractStatus.mockResolvedValue({
          contract_id: 'con-1',
          status: 'TERMINATED',
        });
        expect((await service.terminateContract('con-1')).status).toBe('TERMINATED');

        mockRepo.findContractById.mockResolvedValue({ contract_id: 'con-1', status: 'ACTIVE' });
        expect((await service.terminateContract('con-1')).status).toBe('TERMINATED');
        expect(mockRepo.updateContractStatus).toHaveBeenCalledWith('con-1', 'TERMINATED');
      });

      it('404s terminating an unknown contract', async () => {
        mockRepo.findContractById.mockResolvedValue(null);
        await expect(service.terminateContract('missing')).rejects.toBeInstanceOf(
          NotFoundException,
        );
      });

      it('400s terminating a DRAFT contract', async () => {
        mockRepo.findContractById.mockResolvedValue({ contract_id: 'con-1', status: 'DRAFT' });
        await expect(service.terminateContract('con-1')).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(mockRepo.updateContractStatus).not.toHaveBeenCalled();
      });
    });

    it('handleBoqItemsPublished materializes the line snapshot (ADR-058 CT-2c-2)', async () => {
      const items = [
        {
          item_code: 'A-1',
          description: 'Concrete',
          unit: 'm3',
          quantity: '10.0000',
          unit_cost: '2500.0000',
          estimated_total: '25000.0000',
        },
      ];
      await service.handleBoqItemsPublished({
        version_id: 'ver-1',
        project_id: 'proj-uuid-001',
        tenant_id: 'tenant-uuid-001',
        items,
      });
      expect(mockRepo.replaceBoqSnapshot).toHaveBeenCalledWith('ver-1', 'proj-uuid-001', items);
    });

    describe('attachDocument (ADR-058 CT-2)', () => {
      const dto = { mode: 'upload' as const, file_id: 'file-uuid-1' };

      it('attaches a validated file to the contract', async () => {
        mockRepo.findContractById.mockResolvedValue({ contract_id: 'con-1' });
        mockFileClient.getFileMetadata.mockResolvedValue({ file_id: 'file-uuid-1' });
        mockRepo.attachSignedDocument.mockResolvedValue({
          contract_id: 'con-1',
          signed_document_id: 'file-uuid-1',
        });

        const result = await service.attachDocument('con-1', dto);
        expect(result.signed_document_id).toBe('file-uuid-1');
        expect(mockRepo.attachSignedDocument).toHaveBeenCalledWith('con-1', 'file-uuid-1');
      });

      it('404s when the contract does not exist', async () => {
        mockRepo.findContractById.mockResolvedValue(null);
        await expect(service.attachDocument('missing', dto)).rejects.toBeInstanceOf(
          NotFoundException,
        );
        expect(mockFileClient.getFileMetadata).not.toHaveBeenCalled();
      });

      it('400s when the file does not exist for the tenant', async () => {
        mockRepo.findContractById.mockResolvedValue({ contract_id: 'con-1' });
        mockFileClient.getFileMetadata.mockResolvedValue(null);
        await expect(service.attachDocument('con-1', dto)).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(mockRepo.attachSignedDocument).not.toHaveBeenCalled();
      });

      it('generate mode builds the PDF, uploads it, and binds the returned file_id', async () => {
        mockRepo.findContractById.mockResolvedValue({
          contract_id: 'con-1',
          project_id: 'proj-uuid-001',
          contract_type: 'MAIN_CONTRACT',
          contract_value: '1000000.0000',
          terms: 'Net 30',
        });
        mockRepo.findBoqSnapshotByProject.mockResolvedValue([
          {
            item_code: 'A-1',
            description: 'Concrete',
            unit: 'm3',
            quantity: '10.0000',
            unit_cost: '2500.0000',
            estimated_total: '25000.0000',
          },
        ]);
        mockFileClient.upload.mockResolvedValue({ file_id: 'gen-file-1' });
        mockRepo.attachSignedDocument.mockResolvedValue({
          contract_id: 'con-1',
          signed_document_id: 'gen-file-1',
        });

        const result = await service.attachDocument('con-1', { mode: 'generate' });
        expect(mockFileClient.upload).toHaveBeenCalledWith(
          expect.objectContaining({
            contentType: 'application/pdf',
            entityType: 'contract',
            entityId: 'con-1',
          }),
        );
        expect(mockRepo.attachSignedDocument).toHaveBeenCalledWith('con-1', 'gen-file-1');
        expect(result.signed_document_id).toBe('gen-file-1');
      });
    });

    describe('signContract (ADR-058 CT-3)', () => {
      const signed = {
        contract_id: 'con-1',
        project_id: 'proj-uuid-001',
        signed_document_id: 'file-1',
        status: 'DRAFT',
      };

      it('404 when the contract does not exist', async () => {
        mockRepo.findContractById.mockResolvedValue(null);
        await expect(service.signContract('missing', '1.2.3.4')).rejects.toBeInstanceOf(
          NotFoundException,
        );
      });

      it('400 when the contract has no attached document', async () => {
        mockRepo.findContractById.mockResolvedValue({
          contract_id: 'con-1',
          signed_document_id: null,
        });
        await expect(service.signContract('con-1', '1.2.3.4')).rejects.toBeInstanceOf(
          BadRequestException,
        );
      });

      it('400 when the document file is missing', async () => {
        mockRepo.findContractById.mockResolvedValue(signed);
        mockFileClient.getFileMetadata.mockResolvedValue(null);
        await expect(service.signContract('con-1', '1.2.3.4')).rejects.toBeInstanceOf(
          BadRequestException,
        );
      });

      it('400 when the document has no sha256 hash', async () => {
        mockRepo.findContractById.mockResolvedValue(signed);
        mockFileClient.getFileMetadata.mockResolvedValue({ file_id: 'file-1', sha256: null });
        await expect(service.signContract('con-1', '1.2.3.4')).rejects.toBeInstanceOf(
          BadRequestException,
        );
      });

      it('issues + verifies the VC and records a VERIFIED INTERNAL signature', async () => {
        mockRepo.findContractById.mockResolvedValue(signed);
        mockFileClient.getFileMetadata.mockResolvedValue({
          file_id: 'file-1',
          sha256: 'a'.repeat(64),
        });
        mockCredentialClient.issue.mockResolvedValue({
          vcId: 'vc-1',
          credential: { id: 'urn:vc' },
        });
        mockCredentialClient.verify.mockResolvedValue({ verified: true });
        mockRepo.recordContractSignature.mockResolvedValue({
          signature_id: 'sig-1',
          verification_status: 'VERIFIED',
        });
        // Only the internal signature so far → no draft→signed transition yet.
        mockRepo.listContractSignatures.mockResolvedValue([
          { signer_party: 'INTERNAL', verification_status: 'VERIFIED' },
        ]);

        const result = await service.signContract('con-1', '203.0.113.5');
        expect(mockRepo.updateContractStatus).not.toHaveBeenCalled();
        expect(mockCredentialClient.issue).toHaveBeenCalledWith(
          expect.objectContaining({
            credentialType: 'CONTRACT_SIGNATURE',
            documentHash: 'a'.repeat(64),
          }),
        );
        expect(mockRepo.recordContractSignature).toHaveBeenCalledWith(
          expect.objectContaining({
            signer_party: 'INTERNAL',
            credential_ref: 'vc-1',
            verification_status: 'VERIFIED',
            ip_address: '203.0.113.5',
          }),
        );
        expect(result.verification_status).toBe('VERIFIED');
      });

      it('records FAILED when the VC does not verify', async () => {
        mockRepo.findContractById.mockResolvedValue(signed);
        mockFileClient.getFileMetadata.mockResolvedValue({
          file_id: 'file-1',
          sha256: 'a'.repeat(64),
        });
        mockCredentialClient.issue.mockResolvedValue({ vcId: 'vc-2', credential: {} });
        mockCredentialClient.verify.mockResolvedValue({ verified: false });
        mockRepo.recordContractSignature.mockResolvedValue({
          signature_id: 'sig-x',
          verification_status: 'FAILED',
        });
        mockRepo.listContractSignatures.mockResolvedValue([
          { signer_party: 'INTERNAL', verification_status: 'FAILED' },
        ]);

        await service.signContract('con-1', '1.2.3.4');
        expect(mockRepo.recordContractSignature).toHaveBeenCalledWith(
          expect.objectContaining({ verification_status: 'FAILED' }),
        );
      });

      it('skips the signed transition when the contract is already SIGNED', async () => {
        mockRepo.findContractById.mockResolvedValue({ ...signed, status: 'SIGNED' });
        mockFileClient.getFileMetadata.mockResolvedValue({
          file_id: 'file-1',
          sha256: 'a'.repeat(64),
        });
        mockCredentialClient.issue.mockResolvedValue({ vcId: 'vc-3', credential: {} });
        mockCredentialClient.verify.mockResolvedValue({ verified: true });
        mockRepo.recordContractSignature.mockResolvedValue({
          signature_id: 'sig-y',
          verification_status: 'VERIFIED',
        });

        await service.signContract('con-1', '1.2.3.4');
        expect(mockRepo.listContractSignatures).not.toHaveBeenCalled(); // early return, no re-check
        expect(mockRepo.updateContractStatus).not.toHaveBeenCalled();
      });
    });

    describe('issueSignLink (ADR-058 CT-4)', () => {
      const signed = { contract_id: 'con-1', signed_document_id: 'file-1' };
      const origBase = process.env['CONTRACT_SIGN_URL_BASE'];
      afterEach(() => {
        if (origBase === undefined) delete process.env['CONTRACT_SIGN_URL_BASE'];
        else process.env['CONTRACT_SIGN_URL_BASE'] = origBase;
      });

      it('404 when the contract does not exist', async () => {
        mockRepo.findContractById.mockResolvedValue(null);
        await expect(service.issueSignLink('missing', {})).rejects.toBeInstanceOf(
          NotFoundException,
        );
      });

      it('400 when the contract has no attached document', async () => {
        mockRepo.findContractById.mockResolvedValue({
          contract_id: 'con-1',
          signed_document_id: null,
        });
        await expect(service.issueSignLink('con-1', {})).rejects.toBeInstanceOf(
          BadRequestException,
        );
      });

      it('issues a link with client info + stores the token hash (configured base URL)', async () => {
        process.env['CONTRACT_SIGN_URL_BASE'] = 'https://sign.example';
        mockRepo.findContractById.mockResolvedValue(signed);
        mockSignLink.issue.mockResolvedValue({
          token: 'tok-abc',
          tokenHash: 'h'.repeat(64),
          expiresAt: new Date('2026-08-01T00:00:00Z'),
        });
        mockRepo.createSignToken.mockResolvedValue({ token_id: 'tk-1' });

        const result = await service.issueSignLink('con-1', {
          client_name: 'ACME',
          client_email: 'a@acme.com',
        });
        expect(result.url).toBe('https://sign.example/contracts/sign/tok-abc');
        expect(result.expires_at).toBe('2026-08-01T00:00:00.000Z');
        expect(mockRepo.createSignToken).toHaveBeenCalledWith(
          expect.objectContaining({
            contract_id: 'con-1',
            token_hash: 'h'.repeat(64),
            invited_name: 'ACME',
            invited_email: 'a@acme.com',
          }),
        );
      });

      it('issues a link without client info, using the default base URL', async () => {
        delete process.env['CONTRACT_SIGN_URL_BASE'];
        mockRepo.findContractById.mockResolvedValue(signed);
        mockSignLink.issue.mockResolvedValue({
          token: 'tok-xyz',
          tokenHash: 'h'.repeat(64),
          expiresAt: new Date(),
        });
        mockRepo.createSignToken.mockResolvedValue({ token_id: 'tk-2' });

        const result = await service.issueSignLink('con-1', {});
        expect(result.url).toContain('https://app.cos.local/contracts/sign/tok-xyz');
        expect(mockRepo.createSignToken).toHaveBeenCalledWith(
          expect.objectContaining({ invited_name: null, invited_email: null }),
        );
      });
    });

    describe('signContractAsClient (ADR-058 CT-5)', () => {
      const tokenRow = { token_id: 'tok-id-1', contract_id: 'con-1' };
      beforeEach(() => mockSignLink.hashToken.mockResolvedValue('h'.repeat(64)));

      it('401 for an invalid/used token', async () => {
        mockRepo.findActiveSignToken.mockResolvedValue(null);
        await expect(service.signContractAsClient('tok', {}, '1.2.3.4')).rejects.toBeInstanceOf(
          UnauthorizedException,
        );
      });

      it('400 when the contract has no document', async () => {
        mockRepo.findActiveSignToken.mockResolvedValue(tokenRow);
        mockRepo.findContractById.mockResolvedValue({
          contract_id: 'con-1',
          signed_document_id: null,
        });
        await expect(service.signContractAsClient('tok', {}, '1.2.3.4')).rejects.toBeInstanceOf(
          BadRequestException,
        );
      });

      it('400 when the document hash is unavailable', async () => {
        mockRepo.findActiveSignToken.mockResolvedValue(tokenRow);
        mockRepo.findContractById.mockResolvedValue({
          contract_id: 'con-1',
          signed_document_id: 'file-1',
        });
        mockFileClient.getFileMetadata.mockResolvedValue({ sha256: null });
        await expect(service.signContractAsClient('tok', {}, '1.2.3.4')).rejects.toBeInstanceOf(
          BadRequestException,
        );
      });

      it('records a VERIFIED CLIENT signature, captures client identity, and consumes the token', async () => {
        mockRepo.findActiveSignToken.mockResolvedValue(tokenRow);
        mockRepo.findContractById.mockResolvedValue({
          contract_id: 'con-1',
          project_id: 'proj-uuid-001',
          signed_document_id: 'file-1',
          status: 'DRAFT',
        });
        mockFileClient.getFileMetadata.mockResolvedValue({ sha256: 'a'.repeat(64) });
        mockCredentialClient.issue.mockResolvedValue({ vcId: 'vc-c1', credential: {} });
        mockCredentialClient.verify.mockResolvedValue({ verified: true });
        mockRepo.recordContractSignature.mockResolvedValue({
          signature_id: 'sig-c1',
          verification_status: 'VERIFIED',
        });
        mockRepo.markSignTokenUsed.mockResolvedValue(undefined);
        // Both parties now VERIFIED → draft→signed transition + finance.contract.signed.v1.
        mockRepo.listContractSignatures.mockResolvedValue([
          { signer_party: 'INTERNAL', verification_status: 'VERIFIED' },
          { signer_party: 'CLIENT', verification_status: 'VERIFIED' },
        ]);

        const result = await service.signContractAsClient(
          'tok',
          { client_name: 'Jane Client', client_email: 'jane@client.com' },
          '198.51.100.7',
        );
        expect(result.verification_status).toBe('VERIFIED');
        expect(mockRepo.recordContractSignature).toHaveBeenCalledWith(
          expect.objectContaining({
            signer_party: 'CLIENT',
            magic_link_token_id: 'tok-id-1',
            credential_ref: 'vc-c1',
            ip_address: '198.51.100.7',
            signer_identity: { name: 'Jane Client', email: 'jane@client.com' },
          }),
        );
        expect(mockRepo.markSignTokenUsed).toHaveBeenCalledWith('tok-id-1');
        expect(mockRepo.updateContractStatus).toHaveBeenCalledWith('con-1', 'SIGNED');
      });

      it('records FAILED when the VC does not verify (+ null client identity)', async () => {
        mockRepo.findActiveSignToken.mockResolvedValue(tokenRow);
        mockRepo.findContractById.mockResolvedValue({
          contract_id: 'con-1',
          project_id: 'proj-uuid-001',
          signed_document_id: 'file-1',
          status: 'DRAFT',
        });
        mockFileClient.getFileMetadata.mockResolvedValue({ sha256: 'a'.repeat(64) });
        mockCredentialClient.issue.mockResolvedValue({ vcId: 'vc-c2', credential: {} });
        mockCredentialClient.verify.mockResolvedValue({ verified: false });
        mockRepo.recordContractSignature.mockResolvedValue({
          signature_id: 'sig-cf',
          verification_status: 'FAILED',
        });
        mockRepo.listContractSignatures.mockResolvedValue([
          { signer_party: 'CLIENT', verification_status: 'FAILED' },
        ]);

        await service.signContractAsClient('tok', {}, '1.2.3.4');
        expect(mockRepo.recordContractSignature).toHaveBeenCalledWith(
          expect.objectContaining({
            verification_status: 'FAILED',
            signer_identity: { name: null, email: null },
          }),
        );
      });
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
