// Unit tests — RFQ Workflow Activities (Phase 5)
// getDbUrlForTenant, PrismaClient, and KafkaProducer are all mocked.

jest.mock('../../../tenant/utils/get-db-url', () => ({
  getDbUrlForTenant: jest.fn().mockResolvedValue('postgresql://tenant-db/testdb'),
}));

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(),
}));

jest.mock('@cos/kafka', () => ({
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
import { KafkaProducer } from '@cos/kafka';
import { updateRfqStatus, markQuotationsEvaluated } from '../rfq.activities';

const mockExecuteRaw = jest.fn().mockResolvedValue(1);
const mockExecuteRawUnsafe = jest.fn().mockResolvedValue(undefined);
const mockPrismaDisconnect = jest.fn().mockResolvedValue(undefined);
const mockTransaction = jest.fn();

const mockKafkaConnect = jest.fn().mockResolvedValue(undefined);
const mockKafkaPublish = jest.fn().mockResolvedValue(undefined);
const mockKafkaDisconnect = jest.fn().mockResolvedValue(undefined);

const baseParams = {
  rfq_id: 'rfq-uuid-001',
  tenant_id: 'tenant-uuid-001',
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

  mockKafkaConnect.mockResolvedValue(undefined);
  mockKafkaPublish.mockResolvedValue(undefined);
  mockKafkaDisconnect.mockResolvedValue(undefined);

  (KafkaProducer as jest.Mock).mockImplementation(() => ({
    connect: mockKafkaConnect,
    publish: mockKafkaPublish,
    disconnect: mockKafkaDisconnect,
  }));
});

describe('updateRfqStatus', () => {
  it('executes DB update and publishes event', async () => {
    await updateRfqStatus(baseParams, 'DRAFT', 'PUBLISHED');
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(1);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    expect(mockKafkaConnect).toHaveBeenCalledTimes(1);
    expect(mockKafkaPublish).toHaveBeenCalledTimes(1);
    expect(mockKafkaDisconnect).toHaveBeenCalledTimes(1);
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
    const [template, ...values] = mockExecuteRaw.mock.calls[0]!;
    const sql = template.join('¶');
    expect(sql).toContain('UPDATE procurement.rfqs SET status =');
    expect(sql).toContain('WHERE rfq_id =');
    expect(sql).toContain('AND tenant_id =');
    expect(values).toEqual(['PUBLISHED', 'rfq-uuid-001', 'tenant-uuid-001']);
  });

  it('publishes the exact status_changed envelope and logs the transition', async () => {
    await updateRfqStatus(baseParams, 'DRAFT', 'PUBLISHED');
    expect(mockKafkaPublish).toHaveBeenCalledWith({
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

  it('disconnects kafka even when publish throws and logs the exact failure event', async () => {
    mockKafkaPublish.mockRejectedValueOnce(new Error('kafka down'));
    await updateRfqStatus(baseParams, 'DRAFT', 'PUBLISHED');
    expect(mockKafkaDisconnect).toHaveBeenCalledTimes(1);
    expect(mockPrismaDisconnect).toHaveBeenCalledTimes(1);
    expect(loggerMock.error).toHaveBeenCalledWith(
      {
        event_type: 'procurement.rfq.status_changed.v1',
        err: expect.any(Error),
        correlation_id: 'corr-uuid-001',
      },
      'kafka.publish.failed',
    );
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
  it('executes DB update and publishes event', async () => {
    await markQuotationsEvaluated(baseParams);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    expect(mockKafkaPublish).toHaveBeenCalledTimes(1);
    expect(mockKafkaDisconnect).toHaveBeenCalledTimes(1);
    expect(mockPrismaDisconnect).toHaveBeenCalledTimes(1);
  });

  it('runs the exact EVALUATED UPDATE and publishes the exact CLOSED→EVALUATED envelope', async () => {
    await markQuotationsEvaluated(baseParams);
    const [template, ...values] = mockExecuteRaw.mock.calls[0]!;
    const sql = template.join('¶');
    expect(sql).toContain("UPDATE procurement.rfqs SET status = 'EVALUATED'");
    expect(sql).toContain('WHERE rfq_id =');
    expect(sql).toContain('AND tenant_id =');
    expect(values).toEqual(['rfq-uuid-001', 'tenant-uuid-001']);
    expect(mockKafkaPublish).toHaveBeenCalledWith({
      event_type: 'procurement.rfq.status_changed.v1',
      event_version: '1.0',
      tenant_id: 'tenant-uuid-001',
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

  it('disconnects kafka even when publish throws', async () => {
    mockKafkaPublish.mockRejectedValueOnce(new Error('kafka down'));
    await markQuotationsEvaluated(baseParams);
    expect(mockKafkaDisconnect).toHaveBeenCalledTimes(1);
  });
});
