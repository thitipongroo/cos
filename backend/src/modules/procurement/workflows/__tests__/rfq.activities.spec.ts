// Unit tests — RFQ Workflow Activities (Phase 5)
// getDbUrlForTenant, PrismaClient, and KafkaProducer are all mocked.

jest.mock('../../../../shared/prisma/get-db-url', () => ({
  getDbUrlForTenant: jest.fn().mockResolvedValue('postgresql://tenant-db/testdb'),
}));

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(),
}));

jest.mock('@cos/shared', () => ({
  KafkaProducer: jest.fn(),
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
// publishEvent() queues through EventOutboxService now instead of building a KafkaProducer per
// activity. The envelope assertions below are unchanged and still the point — only the collaborator
// that receives it moved, so `mockKafkaPublish` is rebound to the outbox.
jest.mock('../../../../shared/events/event-outbox.service', () => ({
  // A plain class, NOT jest.fn().mockImplementation(...): the suites below call jest.resetAllMocks()
  // in beforeEach, which strips a mock constructor's implementation and leaves `new` returning a bare
  // object with no publish(). Delegating at CALL time keeps mockKafkaPublish resettable as usual.
  EventOutboxService: class {
    publish(...args: unknown[]): Promise<unknown> {
      return mockKafkaPublish(...args) as Promise<unknown>;
    }
    onModuleDestroy(): Promise<void> {
      return Promise.resolve();
    }
  },
}));
import { updateRfqStatus, markQuotationsEvaluated } from '../rfq.activities';
import { disconnectActivityClients } from '../activity-helpers';

const mockExecuteRaw = jest.fn().mockResolvedValue(1);
const mockExecuteRawUnsafe = jest.fn().mockResolvedValue(undefined);
const mockPrismaDisconnect = jest.fn().mockResolvedValue(undefined);
const mockTransaction = jest.fn();

const mockKafkaPublish = jest.fn().mockResolvedValue(undefined);

const baseParams = {
  rfq_id: 'rfq-uuid-001',
  tenant_id: '00000000-0000-4000-8000-000000000001',
  correlation_id: 'corr-uuid-001',
};

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
  mockKafkaPublish.mockResolvedValue(undefined);
});

describe('updateRfqStatus', () => {
  it('executes DB update and publishes event', async () => {
    await updateRfqStatus(baseParams, 'DRAFT', 'PUBLISHED');
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(1);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    expect(mockKafkaPublish).toHaveBeenCalledTimes(1);
    // Pooling (ADR-021): the client is reused across activities and closed only by
    // disconnectActivityClients() on worker shutdown. Disconnecting per activity is what made every
    // workflow step pay for a fresh pg pool.
    expect(mockPrismaDisconnect).not.toHaveBeenCalled();
  });

  it('sets RLS tenant context with the exact SET LOCAL statement', async () => {
    await updateRfqStatus(baseParams, 'DRAFT', 'PUBLISHED');
    expect(mockExecuteRawUnsafe).toHaveBeenCalledWith(
      "SET LOCAL app.current_tenant_id = '00000000-0000-4000-8000-000000000001'",
    );
  });

  it('runs the exact UPDATE statement with status/rfq/tenant bindings', async () => {
    await updateRfqStatus(baseParams, 'DRAFT', 'PUBLISHED');
    const [template, ...values] = mockExecuteRaw.mock.calls[0]!;
    const sql = template.join('¶');
    expect(sql).toContain('UPDATE procurement.rfqs SET status =');
    expect(sql).toContain('WHERE rfq_id =');
    expect(sql).toContain('AND tenant_id =');
    expect(values).toEqual(['PUBLISHED', 'rfq-uuid-001', '00000000-0000-4000-8000-000000000001']);
  });

  it('publishes the exact status_changed envelope and logs the transition', async () => {
    await updateRfqStatus(baseParams, 'DRAFT', 'PUBLISHED');
    expect(mockKafkaPublish).toHaveBeenCalledWith({
      event_type: 'procurement.rfq.status_changed.v1',
      event_version: '1.0',
      tenant_id: '00000000-0000-4000-8000-000000000001',
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

  it('propagates DB error from withTenantTx', async () => {
    mockTransaction.mockRejectedValueOnce(new Error('DB write failed'));
    await expect(updateRfqStatus(baseParams, 'DRAFT', 'PUBLISHED')).rejects.toThrow(
      'DB write failed',
    );
    // Pooling (ADR-021): the client is reused across activities and closed only by
    // disconnectActivityClients() on worker shutdown. Disconnecting per activity is what made every
    // workflow step pay for a fresh pg pool.
    expect(mockPrismaDisconnect).not.toHaveBeenCalled();
  });
});

describe('module wiring', () => {
  it('creates the module logger with the exact name', () => {
    expect(loggerMock.names).toContain('rfq-activities');
  });
});

// The other half of the ADR-021 pooling contract, previously uncovered (activity-helpers.ts:58-59).
// Nothing else closes these clients: they outlive every individual activity by design, so if the
// worker's shutdown path does not call this, the pg pools leak on SIGTERM (ADR-034 / Rule 39).
describe('disconnectActivityClients', () => {
  it('closes the pooled client and empties the pool', async () => {
    await updateRfqStatus(baseParams, 'DRAFT', 'PUBLISHED');
    expect(mockPrismaDisconnect).not.toHaveBeenCalled();

    await disconnectActivityClients();
    expect(mockPrismaDisconnect).toHaveBeenCalledTimes(1);

    // Pool emptied — the next activity builds a fresh client rather than handing out a closed one.
    (PrismaClient as jest.Mock).mockClear();
    await updateRfqStatus(baseParams, 'DRAFT', 'PUBLISHED');
    expect(PrismaClient).toHaveBeenCalledTimes(1);
  });

  it('is safe to call when no activity has run', async () => {
    await disconnectActivityClients();
    await expect(disconnectActivityClients()).resolves.toBeUndefined();
  });
});

describe('markQuotationsEvaluated', () => {
  it('executes DB update and publishes event', async () => {
    await markQuotationsEvaluated(baseParams);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    expect(mockKafkaPublish).toHaveBeenCalledTimes(1);
    // Pooling (ADR-021): the client is reused across activities and closed only by
    // disconnectActivityClients() on worker shutdown. Disconnecting per activity is what made every
    // workflow step pay for a fresh pg pool.
    expect(mockPrismaDisconnect).not.toHaveBeenCalled();
  });

  it('runs the exact EVALUATED UPDATE and publishes the exact CLOSED→EVALUATED envelope', async () => {
    await markQuotationsEvaluated(baseParams);
    const [template, ...values] = mockExecuteRaw.mock.calls[0]!;
    const sql = template.join('¶');
    expect(sql).toContain("UPDATE procurement.rfqs SET status = 'EVALUATED'");
    expect(sql).toContain('WHERE rfq_id =');
    expect(sql).toContain('AND tenant_id =');
    expect(values).toEqual(['rfq-uuid-001', '00000000-0000-4000-8000-000000000001']);
    expect(mockKafkaPublish).toHaveBeenCalledWith({
      event_type: 'procurement.rfq.status_changed.v1',
      event_version: '1.0',
      tenant_id: '00000000-0000-4000-8000-000000000001',
      actor_id: 'system',
      occurred_at: expect.any(String),
      correlation_id: 'corr-uuid-001',
      payload: {
        rfq_id: 'rfq-uuid-001',
        from_status: 'CLOSED',
        to_status: 'EVALUATED',
      },
    });
    expect(loggerMock.info).toHaveBeenCalledWith(
      { rfq_id: 'rfq-uuid-001', correlation_id: 'corr-uuid-001' },
      'rfq.evaluated',
    );
  });
});
