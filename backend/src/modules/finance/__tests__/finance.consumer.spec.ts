// Unit tests — FinanceConsumer (Phase 7)
// Verifies: topic subscriptions, correct group ID, handler routing, and disconnect.

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

// ── Mock KafkaConsumer ──────────────────────────────────────────────────────

const mockOn = jest.fn();
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockDisconnect = jest.fn().mockResolvedValue(undefined);

jest.mock('@cos/kafka', () => ({
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
import { clsTenantId, clsUserId } from '../../../shared/context/cls-context';
import { FinanceService } from '../finance.service';

// ── Mock FinanceService ─────────────────────────────────────────────────────

const mockHandlePoCreated = jest.fn().mockResolvedValue(undefined);
const mockHandleInvoiceReceived = jest.fn().mockResolvedValue(undefined);
const mockHandlePoStatusChanged = jest.fn().mockResolvedValue(undefined);
const mockHandleBoqItemsPublished = jest.fn().mockResolvedValue(undefined);

const mockSvc: Partial<FinanceService> = {
  handlePoCreated: mockHandlePoCreated,
  handleInvoiceReceived: mockHandleInvoiceReceived,
  handlePoStatusChanged: mockHandlePoStatusChanged,
  handleBoqItemsPublished: mockHandleBoqItemsPublished,
};

// ── Mock ModuleRef ──────────────────────────────────────────────────────────

const mockRegisterRequest = jest.fn();
const mockResolve = jest.fn().mockResolvedValue(mockSvc);
const mockModuleRef = {
  registerRequestByContextId: mockRegisterRequest,
  resolve: mockResolve,
};

const EXPECTED_EVENT_TYPES = [
  'procurement.po.created.v1',
  'procurement.invoice.received.v1',
  'procurement.po.status_changed.v1',
  'construction.boq.items_published.v1',
];

let consumer: FinanceConsumer;

beforeEach(() => {
  jest.clearAllMocks();
  consumer = new FinanceConsumer(mockModuleRef as never);
});

// ── onModuleInit ────────────────────────────────────────────────────────────

describe('onModuleInit', () => {
  it('registers 4 kafka handlers', async () => {
    await consumer.onModuleInit();
    expect(mockOn).toHaveBeenCalledTimes(4);
  });

  it('connects with the shared finance group and all 4 event types', async () => {
    await consumer.onModuleInit();
    expect(mockConnect).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'finance.shared',
        eventTypes: expect.arrayContaining(EXPECTED_EVENT_TYPES),
        fromBeginning: false,
      }),
    );
    const args = mockConnect.mock.calls[0][0] as { eventTypes: string[] };
    expect(args.eventTypes).toHaveLength(4);
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

  it('boq.items_published handler calls svc.handleBoqItemsPublished with the line items', async () => {
    await consumer.onModuleInit();
    const call = (mockOn.mock.calls as unknown[]).find(
      (c) => (c as unknown[])[0] === 'construction.boq.items_published.v1',
    ) as unknown[];
    const handler = call[1] as (e: unknown) => Promise<void>;

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
    await handler({
      event_type: 'construction.boq.items_published.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: { version_id: 'ver-001', project_id: 'proj-001', items },
    });

    expect(mockHandleBoqItemsPublished).toHaveBeenCalledWith(
      expect.objectContaining({
        version_id: 'ver-001',
        project_id: 'proj-001',
        tenant_id: 'tenant-001',
        items,
      }),
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

  // OQ-45. registerRequestByContextId above is NOT enough on its own, and reads as though it is.
  // TenantPrismaService is a singleton that resolves the tenant from CLS and never looks at the
  // request object, so before the handler entered CLS the chain
  //   handlePoCreated → FinanceRepository.createTransaction → db.run()
  // threw "Tenant context missing from request" and no cost transaction was ever written for a PO.
  it('runs the handler inside the event tenant CLS context', async () => {
    let seenTenant: string | undefined;
    let seenUser: string | undefined;
    mockHandlePoCreated.mockImplementationOnce(async () => {
      seenTenant = clsTenantId();
      seenUser = clsUserId();
    });

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

    expect(seenTenant).toBe('tenant-xyz');
    expect(seenUser).toBe('actor-001');
    // Scoped to the callback: the next event, from another tenant, must not inherit this one.
    expect(clsTenantId()).toBe('');
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
