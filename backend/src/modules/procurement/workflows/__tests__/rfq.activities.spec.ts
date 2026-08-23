// Unit tests — RFQ Workflow Activities (Phase 5)
// getDbUrlForTenant and PrismaClient are mocked.
//
// §35.13 ESC-13: the activities no longer hold a KafkaProducer. Each event is written to
// platform.outbox_events through the SAME tenant transaction as the business UPDATE, so these
// tests assert on the outbox INSERT issued via that tx handle. OutboxPublisher is used for real
// (not mocked) — it is the code under test here as much as the activity is.

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
import { updateRfqStatus, markQuotationsEvaluated } from '../rfq.activities';

const mockExecuteRaw = jest.fn().mockResolvedValue(1);
const mockExecuteRawUnsafe = jest.fn().mockResolvedValue(undefined);
const mockPrismaDisconnect = jest.fn().mockResolvedValue(undefined);
const mockTransaction = jest.fn();

const baseParams = {
  rfq_id: 'rfq-uuid-001',
  tenant_id: 'tenant-uuid-001',
  correlation_id: 'corr-uuid-001',
};

/**
 * Reads the outbox envelope out of the `INSERT INTO platform.outbox_events` call that
 * OutboxPublisher.write issued through the transaction's `$executeRaw`.
 */
function outboxEnvelope(): Record<string, unknown> | undefined {
  const call = mockExecuteRaw.mock.calls.find(([template]: [TemplateStringsArray]) =>
    template.join('').includes('INSERT INTO platform.outbox_events'),
  );
  if (!call) return undefined;
  // values: [id, event_type, jsonb payload]
  return JSON.parse(call[3] as string) as Record<string, unknown>;
}

/** The business UPDATE — the `$executeRaw` call that is not the outbox INSERT. */
function businessUpdateCall(): [TemplateStringsArray, ...unknown[]] | undefined {
  return mockExecuteRaw.mock.calls.find(
    ([template]: [TemplateStringsArray]) =>
      !template.join('').includes('INSERT INTO platform.outbox_events'),
  ) as [TemplateStringsArray, ...unknown[]] | undefined;
}

beforeEach(() => {
  jest.resetAllMocks();

  // $transaction calls the callback with a mock tx that has $executeRaw and $executeRawUnsafe
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

describe('updateRfqStatus', () => {
  it('executes the DB update and the outbox insert in ONE transaction', async () => {
    await updateRfqStatus(baseParams, 'DRAFT', 'PUBLISHED');
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(1);
    // one UPDATE + one outbox INSERT, both through the same tx handle
    expect(mockExecuteRaw).toHaveBeenCalledTimes(2);
    expect(mockPrismaDisconnect).toHaveBeenCalledTimes(1);
  });

  it('sets RLS tenant context with the exact SET LOCAL statement', async () => {
    await updateRfqStatus(baseParams, 'DRAFT', 'PUBLISHED');
    expect(mockExecuteRawUnsafe).toHaveBeenCalledWith(
      "SET LOCAL app.current_tenant_id = 'tenant-uuid-001'",
    );
  });

  it('runs the exact UPDATE statement with status/rfq/tenant bindings', async () => {
    await updateRfqStatus(baseParams, 'DRAFT', 'PUBLISHED');
    const [template, ...values] = businessUpdateCall()!;
    const sql = template.join('¶');
    expect(sql).toContain('UPDATE procurement.rfqs SET status =');
    expect(sql).toContain('WHERE rfq_id =');
    expect(sql).toContain('AND tenant_id =');
    expect(values).toEqual(['PUBLISHED', 'rfq-uuid-001', 'tenant-uuid-001']);
  });

  it('writes the exact status_changed envelope to the outbox and logs the transition', async () => {
    await updateRfqStatus(baseParams, 'DRAFT', 'PUBLISHED');
    expect(outboxEnvelope()).toEqual({
      event_id: expect.any(String),
      event_type: 'procurement.rfq.status_changed.v1',
      event_version: '1.0',
      tenant_id: 'tenant-uuid-001',
      actor_id: 'system',
      occurred_at: expect.any(String),
      correlation_id: 'corr-uuid-001',
      payload: {
        rfq_id: 'rfq-uuid-001',
        from_status: 'DRAFT',
        to_status: 'PUBLISHED',
      },
    });
    expect(loggerMock.info).toHaveBeenCalledWith(
      {
        rfq_id: 'rfq-uuid-001',
        from_status: 'DRAFT',
        to_status: 'PUBLISHED',
        correlation_id: 'corr-uuid-001',
      },
      'rfq.status.changed',
    );
  });

  // ESC-13: the old publishEvent caught the Kafka error and returned normally, so Temporal saw a
  // success and never retried — the event was simply lost. The outbox write is part of the
  // transaction, so its failure must roll the UPDATE back and surface to Temporal for retry.
  it('propagates an outbox write failure so Temporal retries the activity', async () => {
    mockExecuteRaw
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(new Error('outbox insert failed'));
    await expect(updateRfqStatus(baseParams, 'DRAFT', 'PUBLISHED')).rejects.toThrow(
      'outbox insert failed',
    );
    expect(mockPrismaDisconnect).toHaveBeenCalledTimes(1);
  });

  it('propagates DB error from withTenantTx', async () => {
    mockTransaction.mockRejectedValueOnce(new Error('DB write failed'));
    await expect(updateRfqStatus(baseParams, 'DRAFT', 'PUBLISHED')).rejects.toThrow(
      'DB write failed',
    );
    expect(mockPrismaDisconnect).toHaveBeenCalledTimes(1);
  });
});

describe('module wiring', () => {
  it('creates the module logger with the exact name', () => {
    expect(loggerMock.names).toContain('rfq-activities');
  });
});

describe('markQuotationsEvaluated', () => {
  it('executes the DB update and the outbox insert in ONE transaction', async () => {
    await markQuotationsEvaluated(baseParams);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(2);
    expect(mockPrismaDisconnect).toHaveBeenCalledTimes(1);
  });

  it('runs the exact EVALUATED UPDATE and outboxes the exact CLOSED→EVALUATED envelope', async () => {
    await markQuotationsEvaluated(baseParams);
    const [template, ...values] = businessUpdateCall()!;
    const sql = template.join('¶');
    expect(sql).toContain("UPDATE procurement.rfqs SET status = 'EVALUATED'");
    expect(sql).toContain('WHERE rfq_id =');
    expect(sql).toContain('AND tenant_id =');
    expect(values).toEqual(['rfq-uuid-001', 'tenant-uuid-001']);
    expect(outboxEnvelope()).toEqual(
      expect.objectContaining({
        event_type: 'procurement.rfq.status_changed.v1',
        tenant_id: 'tenant-uuid-001',
        actor_id: 'system',
        correlation_id: 'corr-uuid-001',
        payload: {
          rfq_id: 'rfq-uuid-001',
          from_status: 'CLOSED',
          to_status: 'EVALUATED',
        },
      }),
    );
    expect(loggerMock.info).toHaveBeenCalledWith(
      { rfq_id: 'rfq-uuid-001', correlation_id: 'corr-uuid-001' },
      'rfq.evaluated',
    );
  });

  it('propagates an outbox write failure so Temporal retries the activity', async () => {
    mockExecuteRaw
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(new Error('outbox insert failed'));
    await expect(markQuotationsEvaluated(baseParams)).rejects.toThrow('outbox insert failed');
  });
});
