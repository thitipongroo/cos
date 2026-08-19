// Unit tests — PO Workflow Activities (Phase 5)
// getDbUrlForTenant, PrismaClient, and KafkaProducer are all mocked.

jest.mock('../../../tenant/utils/get-db-url', () => ({
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
import { updatePoStatus, notifyApprover, compensateCancelledPo } from '../po.activities';

const mockExecuteRaw = jest.fn().mockResolvedValue(1);
const mockExecuteRawUnsafe = jest.fn().mockResolvedValue(undefined);
const mockPrismaDisconnect = jest.fn().mockResolvedValue(undefined);
const mockTransaction = jest.fn();

const mockKafkaPublish = jest.fn().mockResolvedValue(undefined);

const baseParams = {
  po_id: 'po-uuid-001',
  project_id: 'proj-uuid-001',
  vendor_id: 'vendor-uuid-001',
  tenant_id: '00000000-0000-4000-8000-000000000001',
  correlation_id: 'corr-uuid-001',
};

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
  mockKafkaPublish.mockResolvedValue(undefined);
});

describe('module wiring', () => {
  it('creates the module logger with the exact name', () => {
    expect(loggerMock.names).toContain('po-activities');
  });
});

describe('updatePoStatus', () => {
  it('executes DB update and publishes event', async () => {
    await updatePoStatus(baseParams, 'DRAFT', 'PENDING_APPROVAL');
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
    await updatePoStatus(baseParams, 'DRAFT', 'PENDING_APPROVAL');
    expect(mockExecuteRawUnsafe).toHaveBeenCalledWith(
      "SET LOCAL app.current_tenant_id = '00000000-0000-4000-8000-000000000001'",
    );
  });

  it('runs the exact UPDATE statement with status/po/tenant bindings', async () => {
    await updatePoStatus(baseParams, 'DRAFT', 'PENDING_APPROVAL');
    const [template, ...values] = mockExecuteRaw.mock.calls[0]!;
    const sql = template.join('¶');
    expect(sql).toContain('UPDATE procurement.purchase_orders SET status =');
    expect(sql).toContain('WHERE po_id =');
    expect(sql).toContain('AND tenant_id =');
    expect(values).toEqual([
      'PENDING_APPROVAL',
      'po-uuid-001',
      '00000000-0000-4000-8000-000000000001',
    ]);
  });

  it('publishes the exact status_changed event envelope and logs the transition', async () => {
    await updatePoStatus(baseParams, 'DRAFT', 'PENDING_APPROVAL');
    expect(mockKafkaPublish).toHaveBeenCalledWith({
      event_type: 'procurement.po.status_changed.v1',
      event_version: '1.0',
      tenant_id: '00000000-0000-4000-8000-000000000001',
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

  it('propagates DB error from withTenantTx', async () => {
    mockTransaction.mockRejectedValueOnce(new Error('DB write failed'));
    await expect(updatePoStatus(baseParams, 'DRAFT', 'PENDING_APPROVAL')).rejects.toThrow(
      'DB write failed',
    );
    // Pooling (ADR-021): the client is reused across activities and closed only by
    // disconnectActivityClients() on worker shutdown. Disconnecting per activity is what made every
    // workflow step pay for a fresh pg pool.
    expect(mockPrismaDisconnect).not.toHaveBeenCalled();
  });
});

describe('notifyApprover', () => {
  it('publishes approval_requested event without touching DB', async () => {
    await notifyApprover(baseParams, 'approver-uuid-001', 'L1', 'PO-2025-001', '50000', 'THB');
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockKafkaPublish).toHaveBeenCalledTimes(1);
  });

  it('publishes the exact approval_requested envelope and logs the request', async () => {
    await notifyApprover(baseParams, 'approver-uuid-001', 'L1', 'PO-2025-001', '50000', 'THB');
    expect(mockKafkaPublish).toHaveBeenCalledWith({
      event_type: 'procurement.po.approval_requested.v1',
      event_version: '1.0',
      tenant_id: '00000000-0000-4000-8000-000000000001',
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
});

describe('compensateCancelledPo', () => {
  it('publishes status_changed event without touching DB', async () => {
    await compensateCancelledPo(baseParams);
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockKafkaPublish).toHaveBeenCalledTimes(1);
  });

  it('publishes the exact compensation envelope (PENDING_APPROVAL → DRAFT) and logs it', async () => {
    await compensateCancelledPo(baseParams);
    expect(mockKafkaPublish).toHaveBeenCalledWith({
      event_type: 'procurement.po.status_changed.v1',
      event_version: '1.0',
      tenant_id: '00000000-0000-4000-8000-000000000001',
      actor_id: 'system',
      occurred_at: expect.any(String),
      correlation_id: 'corr-uuid-001',
      payload: {
        po_id: 'po-uuid-001',
        from_status: 'PENDING_APPROVAL',
        to_status: 'DRAFT',
      },
    });
    expect(loggerMock.info).toHaveBeenCalledWith(
      { po_id: 'po-uuid-001', correlation_id: 'corr-uuid-001' },
      'po.cancelled.compensation',
    );
  });
});
