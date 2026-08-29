// Finance Service — multi-step flows over a doubled repository (Phase 7).
//
// Renamed from finance.integration.spec.ts on 2026-08-29. It was never an integration test: there is
// no container, no database and no HTTP here — the repository and every collaborator are doubles,
// which is why it runs in the UNIT job (jest.config.js, 15s timeout, no Docker) alongside the rest
// of src/. The old name promised infrastructure this file has never touched.
//
// What it does cover, and what finance.service.spec.ts beside it does not: whole flows across
// several calls — budget lifecycle, procurement event consumption, variance alerting, recordPayment
// — rather than one method at a time.

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
import { Test } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { FinanceService } from '../finance.service';
import { EventOutboxService } from '../../../shared/events/event-outbox.service';
import { makeOutboxDouble } from '../../../shared/events/__tests__/outbox-double';
import { FinanceRepository } from '../finance.repository';
import { CredentialClientService } from '../../credentials/credential-client.service';
import { ContractSignLinkService } from '../contract-sign-link.service';
import { FileServiceClient } from '../../files/file-service-client.service';

// ── In-memory repository ────────────────────────────────────────────────────

const mockRepo = {
  upsertBudget: jest.fn(),
  findBudgetByProject: jest.fn(),
  updateBudgetAggregates: jest.fn().mockResolvedValue(undefined),
  addBudgetLine: jest.fn(),
  findLinesByBudget: jest.fn(),
  createTransaction: jest.fn(),
  findCostTransactions: jest.fn(),
  sumTransactionsByProject: jest.fn(),
  deleteTransactionBySource: jest.fn().mockResolvedValue(undefined),
  createPayment: jest.fn(),
  findPayments: jest.fn(),
  findAllBudgets: jest.fn(),
};

const mockRequest = { tenantId: 'tenant-int-001', user: { user_id: 'user-int-001' } };

const budgetRow = {
  budget_id: 'budget-int-001',
  project_id: 'proj-int-001',
  tenant_id: 'tenant-int-001',
  total_budget_amount: '1000000.0000',
  total_budget_currency: 'THB',
  allocated_amount: '0.0000',
  committed_amount: '0.0000',
  actual_amount: '0.0000',
  variance_alert_threshold: '10.00',
  created_at: new Date(),
  updated_at: new Date(),
};

// ── Setup ───────────────────────────────────────────────────────────────────

let svc: FinanceService;

async function buildSvc() {
  const module = await Test.createTestingModule({
    providers: [
      FinanceService,
      { provide: EventOutboxService, useValue: makeOutboxDouble().service },
      { provide: FinanceRepository, useValue: mockRepo },
      { provide: FileServiceClient, useValue: { getFileMetadata: jest.fn() } },
      { provide: CredentialClientService, useValue: { issue: jest.fn(), verify: jest.fn() } },
      {
        provide: ContractSignLinkService,
        useValue: { issue: jest.fn(), verify: jest.fn(), hashToken: jest.fn() },
      },
      { provide: REQUEST, useValue: mockRequest },
    ],
  }).compile();
  return module.resolve<FinanceService>(FinanceService);
}

beforeEach(async () => {
  jest.clearAllMocks();
  svc = await buildSvc();
});

// ── Budget lifecycle ─────────────────────────────────────────────────────────

describe('Budget lifecycle', () => {
  it('creates budget, then gets summary with variance 0%', async () => {
    mockRepo.upsertBudget.mockResolvedValue(budgetRow);
    const created = await svc.createOrUpdateBudget('proj-int-001', {
      total_budget_amount: '1000000.0000',
      total_budget_currency: 'THB',
    });
    expect(created.budget_id).toBe('budget-int-001');

    mockRepo.findBudgetByProject.mockResolvedValue(budgetRow);
    mockRepo.findLinesByBudget.mockResolvedValue([]);
    const summary = await svc.getBudgetSummary('proj-int-001');
    expect(summary.variance_percentage).toBe('0.0000');
  });

  it('throws NotFoundException when getting summary for unknown project', async () => {
    mockRepo.findBudgetByProject.mockResolvedValue(null);
    await expect(svc.getBudgetSummary('unknown-project')).rejects.toThrow(NotFoundException);
  });

  it('adds budget line and recalculates allocated', async () => {
    mockRepo.findBudgetByProject.mockResolvedValue(budgetRow);
    const lineRow = {
      line_id: 'line-int-001',
      budget_id: 'budget-int-001',
      project_id: 'proj-int-001',
      tenant_id: 'tenant-int-001',
      boq_category_id: null,
      line_name: 'Foundation',
      allocated_amount: '300000.0000',
      currency_code: 'THB',
      created_at: new Date(),
    };
    mockRepo.addBudgetLine.mockResolvedValue(lineRow);
    mockRepo.findLinesByBudget.mockResolvedValue([lineRow]);

    const result = await svc.addBudgetLine('proj-int-001', {
      line_name: 'Foundation',
      allocated_amount: '300000.0000',
      currency_code: 'THB',
    });

    expect(result.line_id).toBe('line-int-001');
    expect(mockRepo.updateBudgetAggregates).toHaveBeenCalledWith(
      expect.objectContaining({ allocated_amount: '300000.0000' }),
    );
  });
});

// ── Procurement event consumption ────────────────────────────────────────────

describe('Kafka event handlers', () => {
  it('handlePoCreated creates COMMITTED transaction and recalculates', async () => {
    mockRepo.createTransaction.mockResolvedValue({});
    mockRepo.findBudgetByProject.mockResolvedValue(budgetRow);
    mockRepo.sumTransactionsByProject.mockResolvedValue({
      committed_total: '100000',
      actual_total: '0',
    });

    await svc.handlePoCreated({
      po_id: 'po-int-001',
      project_id: 'proj-int-001',
      tenant_id: 'tenant-int-001',
      total_amount: { amount: '100000.00', currency_code: 'THB' },
    });

    expect(mockRepo.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ source_type: 'PURCHASE_ORDER', source_id: 'po-int-001' }),
    );
    expect(mockRepo.updateBudgetAggregates).toHaveBeenCalled();
  });

  it('handleInvoiceReceived creates ACTUAL transaction and recalculates', async () => {
    mockRepo.createTransaction.mockResolvedValue({});
    mockRepo.findBudgetByProject.mockResolvedValue(budgetRow);
    mockRepo.sumTransactionsByProject.mockResolvedValue({
      committed_total: '0',
      actual_total: '50000',
    });

    await svc.handleInvoiceReceived({
      po_id: 'po-int-001',
      invoice_id: 'inv-int-001',
      project_id: 'proj-int-001',
      tenant_id: 'tenant-int-001',
      amount: { amount: '50000.00', currency_code: 'THB' },
    });

    expect(mockRepo.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ source_type: 'INVOICE', source_id: 'inv-int-001' }),
    );
  });

  it('handlePoStatusChanged CANCELLED removes committed transaction', async () => {
    mockRepo.findBudgetByProject.mockResolvedValue(budgetRow);
    mockRepo.sumTransactionsByProject.mockResolvedValue({
      committed_total: '0',
      actual_total: '0',
    });

    await svc.handlePoStatusChanged({
      po_id: 'po-int-001',
      project_id: 'proj-int-001',
      tenant_id: 'tenant-int-001',
      from_status: 'APPROVED',
      to_status: 'CANCELLED',
    });

    expect(mockRepo.deleteTransactionBySource).toHaveBeenCalledWith('po-int-001');
  });

  it('handlePoStatusChanged REJECTED removes committed transaction', async () => {
    mockRepo.findBudgetByProject.mockResolvedValue(budgetRow);
    mockRepo.sumTransactionsByProject.mockResolvedValue({
      committed_total: '0',
      actual_total: '0',
    });

    await svc.handlePoStatusChanged({
      po_id: 'po-int-002',
      project_id: 'proj-int-001',
      tenant_id: 'tenant-int-001',
      from_status: 'PENDING',
      to_status: 'REJECTED',
    });

    expect(mockRepo.deleteTransactionBySource).toHaveBeenCalledWith('po-int-002');
  });

  it('handlePoStatusChanged APPROVED does nothing', async () => {
    await svc.handlePoStatusChanged({
      po_id: 'po-int-003',
      project_id: 'proj-int-001',
      tenant_id: 'tenant-int-001',
      from_status: 'DRAFT',
      to_status: 'APPROVED',
    });

    expect(mockRepo.deleteTransactionBySource).not.toHaveBeenCalled();
  });
});

// ── Variance alert ────────────────────────────────────────────────────────────

describe('Variance alert', () => {
  it('emits finance.variance.alert.v1 when variance exceeds threshold', async () => {
    const overBudgetRow = {
      ...budgetRow,
      allocated_amount: '100000.0000',
      variance_alert_threshold: '5.00',
    };
    mockRepo.createTransaction.mockResolvedValue({});
    mockRepo.findBudgetByProject.mockResolvedValue(overBudgetRow);
    mockRepo.sumTransactionsByProject.mockResolvedValue({
      committed_total: '80000',
      actual_total: '40000', // total 120% of allocated = +20% variance
    });

    // Should not throw — Kafka publish failure is swallowed
    await expect(
      svc.handlePoCreated({
        po_id: 'po-alert-001',
        project_id: 'proj-int-001',
        tenant_id: 'tenant-int-001',
        total_amount: { amount: '80000', currency_code: 'THB' },
      }),
    ).resolves.not.toThrow();
  });
});

// ── Payments ──────────────────────────────────────────────────────────────────

describe('recordPayment', () => {
  it('creates payment and emits finance.payment.processed.v1', async () => {
    const payRow = {
      payment_id: 'pay-int-001',
      invoice_id: 'inv-int-001',
      project_id: 'proj-int-001',
      tenant_id: 'tenant-int-001',
      amount: '50000.0000',
      currency_code: 'THB',
      payment_date: new Date(),
      payment_reference: null,
      wht_certificate_ref: null,
      status: 'PROCESSED' as const,
      recorded_by: 'user-int-001',
      created_at: new Date(),
    };
    mockRepo.createPayment.mockResolvedValue(payRow);

    const result = await svc.recordPayment({
      project_id: 'proj-int-001',
      invoice_id: 'inv-int-001',
      amount: '50000.0000',
      currency_code: 'THB',
      payment_date: '2026-06-08',
    });

    expect(result.payment_id).toBe('pay-int-001');
    expect(mockRepo.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ invoice_id: 'inv-int-001', amount: '50000.0000' }),
    );
  });
});
