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

import { PrismaClient } from '@prisma/client';
import { KafkaProducer } from '@cos/shared';
import { updatePoStatus, notifyApprover, compensateCancelledPo } from '../po.activities';

const mockExecuteRaw = jest.fn().mockResolvedValue(1);
const mockExecuteRawUnsafe = jest.fn().mockResolvedValue(undefined);
const mockPrismaDisconnect = jest.fn().mockResolvedValue(undefined);
const mockTransaction = jest.fn();

const mockKafkaConnect = jest.fn().mockResolvedValue(undefined);
const mockKafkaPublish = jest.fn().mockResolvedValue(undefined);
const mockKafkaDisconnect = jest.fn().mockResolvedValue(undefined);

const baseParams = {
  po_id: 'po-uuid-001',
  project_id: 'proj-uuid-001',
  vendor_id: 'vendor-uuid-001',
  tenant_id: 'tenant-uuid-001',
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

  mockKafkaConnect.mockResolvedValue(undefined);
  mockKafkaPublish.mockResolvedValue(undefined);
  mockKafkaDisconnect.mockResolvedValue(undefined);

  (KafkaProducer as jest.Mock).mockImplementation(() => ({
    connect: mockKafkaConnect,
    publish: mockKafkaPublish,
    disconnect: mockKafkaDisconnect,
  }));
});

describe('updatePoStatus', () => {
  it('executes DB update and publishes event', async () => {
    await updatePoStatus(baseParams, 'DRAFT', 'PENDING_APPROVAL');
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(1);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    expect(mockKafkaConnect).toHaveBeenCalledTimes(1);
    expect(mockKafkaPublish).toHaveBeenCalledTimes(1);
    expect(mockKafkaDisconnect).toHaveBeenCalledTimes(1);
    expect(mockPrismaDisconnect).toHaveBeenCalledTimes(1);
  });

  it('disconnects kafka even when publish throws', async () => {
    mockKafkaPublish.mockRejectedValueOnce(new Error('kafka down'));
    await updatePoStatus(baseParams, 'DRAFT', 'PENDING_APPROVAL');
    expect(mockKafkaDisconnect).toHaveBeenCalledTimes(1);
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
  it('publishes approval_requested event without touching DB', async () => {
    await notifyApprover(baseParams, 'approver-uuid-001', 'L1', 'PO-2025-001', '50000', 'THB');
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockKafkaConnect).toHaveBeenCalledTimes(1);
    expect(mockKafkaPublish).toHaveBeenCalledTimes(1);
    expect(mockKafkaDisconnect).toHaveBeenCalledTimes(1);
  });

  it('disconnects kafka even when publish throws', async () => {
    mockKafkaPublish.mockRejectedValueOnce(new Error('kafka down'));
    await notifyApprover(baseParams, 'approver-uuid-001', 'L1', 'PO-2025-001', '50000', 'THB');
    expect(mockKafkaDisconnect).toHaveBeenCalledTimes(1);
  });
});

describe('compensateCancelledPo', () => {
  it('publishes status_changed event without touching DB', async () => {
    await compensateCancelledPo(baseParams);
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockKafkaConnect).toHaveBeenCalledTimes(1);
    expect(mockKafkaPublish).toHaveBeenCalledTimes(1);
    expect(mockKafkaDisconnect).toHaveBeenCalledTimes(1);
  });

  it('disconnects kafka even when publish throws', async () => {
    mockKafkaPublish.mockRejectedValueOnce(new Error('kafka down'));
    await compensateCancelledPo(baseParams);
    expect(mockKafkaDisconnect).toHaveBeenCalledTimes(1);
  });
});
