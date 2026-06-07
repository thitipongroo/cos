// Unit tests — FinanceConsumer (Phase 7)
// Verifies: topic subscriptions, correct group ID, handler routing, and disconnect.

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

// ── Mock KafkaConsumer ──────────────────────────────────────────────────────

const mockOn = jest.fn();
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockDisconnect = jest.fn().mockResolvedValue(undefined);

jest.mock('@cos/shared', () => ({
  KafkaConsumer: jest.fn().mockImplementation(() => ({
    on: mockOn,
    connect: mockConnect,
    disconnect: mockDisconnect,
  })),
}));

// ── Mock NestJS core ContextIdFactory ───────────────────────────────────────

jest.mock('@nestjs/core', () => {
  const actual = jest.requireActual<Record<string, unknown>>('@nestjs/core');
  return {
    ...actual,
    ContextIdFactory: {
      create: jest.fn().mockReturnValue({ id: 1 }),
    },
  };
});

import { FinanceConsumer } from '../finance.consumer';
import { FinanceService } from '../finance.service';

// ── Mock FinanceService ─────────────────────────────────────────────────────

const mockHandlePoCreated = jest.fn().mockResolvedValue(undefined);
const mockHandleInvoiceReceived = jest.fn().mockResolvedValue(undefined);
const mockHandlePoStatusChanged = jest.fn().mockResolvedValue(undefined);

const mockSvc: Partial<FinanceService> = {
  handlePoCreated: mockHandlePoCreated,
  handleInvoiceReceived: mockHandleInvoiceReceived,
  handlePoStatusChanged: mockHandlePoStatusChanged,
};

// ── Mock ModuleRef ──────────────────────────────────────────────────────────

const mockRegisterRequest = jest.fn();
const mockResolve = jest.fn().mockResolvedValue(mockSvc);
const mockModuleRef = {
  registerRequestByContextId: mockRegisterRequest,
  resolve: mockResolve,
};

const EXPECTED_TOPICS = [
  'procurement.po.created',
  'procurement.invoice.received',
  'procurement.po.status_changed',
];

let consumer: FinanceConsumer;

beforeEach(() => {
  jest.clearAllMocks();
  consumer = new FinanceConsumer(mockModuleRef as never);
});

// ── onModuleInit ────────────────────────────────────────────────────────────

describe('onModuleInit', () => {
  it('registers 3 kafka handlers', async () => {
    await consumer.onModuleInit();
    expect(mockOn).toHaveBeenCalledTimes(3);
  });

  it('connects with finance-consumer-group and all 3 topics', async () => {
    await consumer.onModuleInit();
    expect(mockConnect).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'finance-consumer-group',
        topics: expect.arrayContaining(EXPECTED_TOPICS),
        fromBeginning: false,
      }),
    );
    const args = mockConnect.mock.calls[0][0] as { topics: string[] };
    expect(args.topics).toHaveLength(3);
  });

  it('po.created handler calls svc.handlePoCreated with correct payload', async () => {
    await consumer.onModuleInit();
    const call = (mockOn.mock.calls as unknown[]).find(
      (c) => (c as unknown[])[0] === 'procurement.po.created.v1',
    ) as unknown[];
    expect(call).toBeDefined();
    const handler = call[1] as (e: unknown) => Promise<void>;

    await handler({
      event_type: 'procurement.po.created.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: {
        po_id: 'po-001',
        project_id: 'proj-001',
        total_amount: { amount: '100000.00', currency_code: 'THB' },
      },
    });

    expect(mockResolve).toHaveBeenCalled();
    expect(mockHandlePoCreated).toHaveBeenCalledWith(
      expect.objectContaining({ po_id: 'po-001', project_id: 'proj-001', tenant_id: 'tenant-001' }),
    );
  });

  it('invoice.received handler calls svc.handleInvoiceReceived', async () => {
    await consumer.onModuleInit();
    const call = (mockOn.mock.calls as unknown[]).find(
      (c) => (c as unknown[])[0] === 'procurement.invoice.received.v1',
    ) as unknown[];
    const handler = call[1] as (e: unknown) => Promise<void>;

    await handler({
      event_type: 'procurement.invoice.received.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: {
        po_id: 'po-001',
        invoice_id: 'inv-001',
        project_id: 'proj-001',
        amount: { amount: '50000.00', currency_code: 'THB' },
      },
    });

    expect(mockHandleInvoiceReceived).toHaveBeenCalledWith(
      expect.objectContaining({ invoice_id: 'inv-001', tenant_id: 'tenant-001' }),
    );
  });

  it('po.status_changed handler calls svc.handlePoStatusChanged', async () => {
    await consumer.onModuleInit();
    const call = (mockOn.mock.calls as unknown[]).find(
      (c) => (c as unknown[])[0] === 'procurement.po.status_changed.v1',
    ) as unknown[];
    const handler = call[1] as (e: unknown) => Promise<void>;

    await handler({
      event_type: 'procurement.po.status_changed.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: {
        po_id: 'po-001',
        project_id: 'proj-001',
        from_status: 'APPROVED',
        to_status: 'CANCELLED',
      },
    });

    expect(mockHandlePoStatusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ po_id: 'po-001', to_status: 'CANCELLED', tenant_id: 'tenant-001' }),
    );
  });

  it('resolveSvc calls registerRequestByContextId with tenant_id', async () => {
    await consumer.onModuleInit();
    const call = (mockOn.mock.calls as unknown[]).find(
      (c) => (c as unknown[])[0] === 'procurement.po.created.v1',
    ) as unknown[];
    const handler = call[1] as (e: unknown) => Promise<void>;

    await handler({
      event_type: 'procurement.po.created.v1',
      tenant_id: 'tenant-xyz',
      actor_id: 'actor-001',
      payload: {
        po_id: 'po-001',
        project_id: 'proj-001',
        total_amount: { amount: '100', currency_code: 'THB' },
      },
    });

    expect(mockRegisterRequest).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-xyz' }),
      expect.anything(),
    );
  });
});

// ── onModuleDestroy ─────────────────────────────────────────────────────────

describe('onModuleDestroy', () => {
  it('calls kafka.disconnect() on teardown', async () => {
    await consumer.onModuleInit();
    await consumer.onModuleDestroy();
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('swallows disconnect errors without rethrowing', async () => {
    mockDisconnect.mockRejectedValueOnce(new Error('broker unavailable'));
    await consumer.onModuleInit();
    await expect(consumer.onModuleDestroy()).resolves.not.toThrow();
  });
});
