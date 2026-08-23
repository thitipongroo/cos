// Unit tests — PO Workflow Activities (Phase 5)
// getDbUrlForTenant and PrismaClient are mocked.
//
// §35.13 ESC-13: the activities no longer hold a KafkaProducer. Each event is written to
// platform.outbox_events through a tenant transaction — the SAME one as the business UPDATE where
// there is one — so these tests assert on the outbox INSERT issued via that tx handle.
// OutboxPublisher is used for real (not mocked): it is part of what these tests cover.

jest.mock('../../../tenant/utils/get-db-url', () => ({
  getDbUrlForTenant: jest.fn().mockResolvedValue('postgresql://tenant-db/testdb'),
}));

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(),
}));

jest.mock('@cos/logger', () => {
  const info = jest.fn();
  const warn = jest.fn();
  const error = jest.fn();
  const names: string[] = [];
  const createLogger = jest.fn((module: string) => {
    names.push(module);
    return { info, warn, error, debug: jest.fn(), child: jest.fn() };
  });
  return { createLogger, __loggerMock: { info, warn, error, names } };
});
const { __loggerMock: loggerMock } = jest.requireMock('@cos/logger');

import { PrismaClient } from '@prisma/client';
import { updatePoStatus, notifyApprover, compensateCancelledPo } from '../po.activities';

const mockExecuteRaw = jest.fn().mockResolvedValue(1);
const mockExecuteRawUnsafe = jest.fn().mockResolvedValue(undefined);
const mockPrismaDisconnect = jest.fn().mockResolvedValue(undefined);
const mockTransaction = jest.fn();

const baseParams = {
  po_id: 'po-uuid-001',
  project_id: 'proj-uuid-001',
  vendor_id: 'vendor-uuid-001',
  tenant_id: 'tenant-uuid-001',
  correlation_id: 'corr-uuid-001',
};

const OUTBOX_SQL = 'INSERT INTO platform.outbox_events';

/** Reads the envelope out of the outbox INSERT that OutboxPublisher.write issued. */
function outboxEnvelope(): Record<string, unknown> | undefined {
  const call = mockExecuteRaw.mock.calls.find(([t]: [TemplateStringsArray]) =>
    t.join('').includes(OUTBOX_SQL),
  );
  return call ? (JSON.parse(call[3] as string) as Record<string, unknown>) : undefined;
}

/** The business UPDATE — the `$executeRaw` call that is not the outbox INSERT. */
function businessUpdateCall(): [TemplateStringsArray, ...unknown[]] | undefined {
  return mockExecuteRaw.mock.calls.find(
    ([t]: [TemplateStringsArray]) => !t.join('').includes(OUTBOX_SQL),
  ) as [TemplateStringsArray, ...unknown[]] | undefined;
}

beforeEach(() => {
  jest.resetAllMocks();

  const mockTx = { $executeRaw: mockExecuteRaw, $executeRawUnsafe: mockExecuteRawUnsafe };
  mockTransaction.mockImplementation((fn: (tx: typeof mockTx) => unknown) => fn(mockTx));
  mockExecuteRaw.mockResolvedValue(1);
  mockExecuteRawUnsafe.mockResolvedValue(undefined);
  mockPrismaDisconnect.mockResolvedValue(undefined);

  (PrismaClient as jest.Mock).mockImplementation(() => ({
    $transaction: mockTransaction,
    $disconnect: mockPrismaDisconnect,
  }));
});

describe('module wiring', () => {
  it('creates the module logger with the exact name', () => {
    expect(loggerMock.names).toContain('po-activities');
  });
});

describe('updatePoStatus', () => {
  it('executes the DB update and the outbox insert in ONE transaction', async () => {
    await updatePoStatus(baseParams, 'DRAFT', 'PENDING_APPROVAL');
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(1);
    // one UPDATE + one outbox INSERT, both through the same tx handle
    expect(mockExecuteRaw).toHaveBeenCalledTimes(2);
    expect(mockPrismaDisconnect).toHaveBeenCalledTimes(1);
  });

  it('sets RLS tenant context with the exact SET LOCAL statement', async () => {
    await updatePoStatus(baseParams, 'DRAFT', 'PENDING_APPROVAL');
    expect(mockExecuteRawUnsafe).toHaveBeenCalledWith(
      "SET LOCAL app.current_tenant_id = 'tenant-uuid-001'",
    );
  });

  it('runs the exact UPDATE statement with status/po/tenant bindings', async () => {
    await updatePoStatus(baseParams, 'DRAFT', 'PENDING_APPROVAL');
    const [template, ...values] = businessUpdateCall()!;
    const sql = template.join('¶');
    expect(sql).toContain('UPDATE procurement.purchase_orders SET status =');
    expect(sql).toContain('WHERE po_id =');
    expect(sql).toContain('AND tenant_id =');
    expect(values).toEqual(['PENDING_APPROVAL', 'po-uuid-001', 'tenant-uuid-001']);
  });

  it('writes the exact status_changed envelope to the outbox and logs the transition', async () => {
    await updatePoStatus(baseParams, 'DRAFT', 'PENDING_APPROVAL');
    expect(outboxEnvelope()).toEqual({
      event_id: expect.any(String),
      event_type: 'procurement.po.status_changed.v1',
      event_version: '1.0',
      tenant_id: 'tenant-uuid-001',
      actor_id: 'system',
      occurred_at: expect.any(String),
      correlation_id: 'corr-uuid-001',
      payload: {
        po_id: 'po-uuid-001',
        from_status: 'DRAFT',
        to_status: 'PENDING_APPROVAL',
      },
    });
    expect(loggerMock.info).toHaveBeenCalledWith(
      {
        po_id: 'po-uuid-001',
        from_status: 'DRAFT',
        to_status: 'PENDING_APPROVAL',
        correlation_id: 'corr-uuid-001',
      },
      'po.status.changed',
    );
  });

  // ESC-13: the old publishEvent caught the Kafka error and returned normally, so Temporal saw a
  // success and never retried — the event was simply lost. The outbox write is part of the
  // transaction, so its failure must roll the UPDATE back and surface to Temporal for retry.
  it('propagates an outbox write failure so Temporal retries the activity', async () => {
    mockExecuteRaw
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(new Error('outbox insert failed'));
    await expect(updatePoStatus(baseParams, 'DRAFT', 'PENDING_APPROVAL')).rejects.toThrow(
      'outbox insert failed',
    );
    expect(mockPrismaDisconnect).toHaveBeenCalledTimes(1);
  });

  it('propagates DB error from withTenantTx', async () => {
    mockTransaction.mockRejectedValueOnce(new Error('DB write failed'));
    await expect(updatePoStatus(baseParams, 'DRAFT', 'PENDING_APPROVAL')).rejects.toThrow(
      'DB write failed',
    );
    expect(mockPrismaDisconnect).toHaveBeenCalledTimes(1);
  });
});

describe('notifyApprover', () => {
  // No business row changes here, so there is nothing to be atomic *with* — the outbox is used
  // purely as the durable at-least-once relay (§35.13 ESC-13).
  it('writes the event in its own transaction, with no business UPDATE', async () => {
    await notifyApprover(baseParams, 'approver-uuid-001', 'L1', 'PO-2025-001', '50000', 'THB');
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    expect(businessUpdateCall()).toBeUndefined();
    expect(mockPrismaDisconnect).toHaveBeenCalledTimes(1);
  });

  it('writes the exact approval_requested envelope and logs the request', async () => {
    await notifyApprover(baseParams, 'approver-uuid-001', 'L1', 'PO-2025-001', '50000', 'THB');
    expect(outboxEnvelope()).toEqual({
      event_id: expect.any(String),
      event_type: 'procurement.po.approval_requested.v1',
      event_version: '1.0',
      tenant_id: 'tenant-uuid-001',
      actor_id: 'system',
      occurred_at: expect.any(String),
      correlation_id: 'corr-uuid-001',
      payload: {
        po_id: 'po-uuid-001',
        project_id: 'proj-uuid-001',
        approver_id: 'approver-uuid-001',
        tier: 'L1',
        po_number: 'PO-2025-001',
        total_amount: '50000',
        currency_code: 'THB',
      },
    });
    expect(loggerMock.info).toHaveBeenCalledWith(
      {
        po_id: 'po-uuid-001',
        approver_id: 'approver-uuid-001',
        tier: 'L1',
        po_number: 'PO-2025-001',
        correlation_id: 'corr-uuid-001',
      },
      'po.approval.requested',
    );
  });

  it('propagates an outbox write failure so Temporal retries the activity', async () => {
    mockExecuteRaw.mockRejectedValueOnce(new Error('outbox insert failed'));
    await expect(
      notifyApprover(baseParams, 'approver-uuid-001', 'L1', 'PO-2025-001', '50000', 'THB'),
    ).rejects.toThrow('outbox insert failed');
  });
});

describe('compensateCancelledPo', () => {
  it('writes the event in its own transaction, with no business UPDATE', async () => {
    await compensateCancelledPo(baseParams);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    expect(businessUpdateCall()).toBeUndefined();
  });

  it('writes the exact compensation envelope (PENDING_APPROVAL → DRAFT) and logs it', async () => {
    await compensateCancelledPo(baseParams);
    expect(outboxEnvelope()).toEqual(
      expect.objectContaining({
        event_type: 'procurement.po.status_changed.v1',
        tenant_id: 'tenant-uuid-001',
        actor_id: 'system',
        correlation_id: 'corr-uuid-001',
        payload: {
          po_id: 'po-uuid-001',
          from_status: 'PENDING_APPROVAL',
          to_status: 'DRAFT',
        },
      }),
    );
    expect(loggerMock.info).toHaveBeenCalledWith(
      { po_id: 'po-uuid-001', correlation_id: 'corr-uuid-001' },
      'po.cancelled.compensation',
    );
  });

  it('propagates an outbox write failure so Temporal retries the compensation', async () => {
    mockExecuteRaw.mockRejectedValueOnce(new Error('outbox insert failed'));
    await expect(compensateCancelledPo(baseParams)).rejects.toThrow('outbox insert failed');
  });
});
