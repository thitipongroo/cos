// Unit tests — NotificationConsumer (Phase 20)
// Verifies: group ID, topic subscriptions, handler routing, and disconnect.

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

import { NotificationConsumer } from '../notification.consumer';

// ── Mock NotificationService ────────────────────────────────────────────────

const mockHandleEvent = jest.fn().mockResolvedValue(undefined);
const mockSvc = { handleEvent: mockHandleEvent };

// ── helpers ─────────────────────────────────────────────────────────────────

const EXPECTED_EVENT_TYPES = [
  'site.inspection.failed.v1',
  'site.issue.created.v1',
  'site.conflict.flagged.v1',
  'procurement.po.status_changed.v1',
  'finance.variance.alert.v1',
  'site.report.created.v1',
  'procurement.invoice.received.v1',
  'file.document.quarantined.v1',
];

let consumer: NotificationConsumer;

beforeEach(() => {
  jest.clearAllMocks();
  consumer = new NotificationConsumer(mockSvc as never);
});

// ── onModuleInit ────────────────────────────────────────────────────────────

describe('onModuleInit', () => {
  it('registers a handler for each of the 8 subscribed topics', async () => {
    await consumer.onModuleInit();
    expect(mockOn).toHaveBeenCalledTimes(8);
    const registeredEventTypes = mockOn.mock.calls.map((c: unknown[]) => c[0]);
    for (const eventType of EXPECTED_EVENT_TYPES) {
      expect(registeredEventTypes).toContain(eventType);
    }
  });

  it('connects with the shared group ID and all 8 event types', async () => {
    await consumer.onModuleInit();
    expect(mockConnect).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'notification.shared',
        eventTypes: expect.arrayContaining(EXPECTED_EVENT_TYPES),
      }),
    );
    const callArgs = mockConnect.mock.calls[0][0] as { eventTypes: string[] };
    expect(callArgs.eventTypes).toHaveLength(8);
  });

  it('connects with fromBeginning = false', async () => {
    await consumer.onModuleInit();
    expect(mockConnect).toHaveBeenCalledWith(expect.objectContaining({ fromBeginning: false }));
  });

  it('handler calls svc.handleEvent with correct shape', async () => {
    await consumer.onModuleInit();

    // Extract the handler registered for site.inspection.failed.v1
    const call = (mockOn.mock.calls as unknown[]).find(
      (c) => (c as unknown[])[0] === 'site.inspection.failed.v1',
    ) as unknown[];
    expect(call).toBeDefined();
    const handler = call[1] as (e: unknown) => Promise<void>;

    const event = {
      event_type: 'site.inspection.failed.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: { project_id: 'proj-001' },
    };
    await handler(event);

    expect(mockHandleEvent).toHaveBeenCalledWith({
      event_type: 'site.inspection.failed.v1',
      tenant_id: 'tenant-001',
      actor_id: 'actor-001',
      payload: { project_id: 'proj-001' },
    });
  });

  it('each handler forwards to svc.handleEvent with matching event_type', async () => {
    await consumer.onModuleInit();

    for (const eventType of EXPECTED_EVENT_TYPES) {
      const call = (mockOn.mock.calls as unknown[]).find(
        (c) => (c as unknown[])[0] === eventType,
      ) as unknown[];
      const handler = call[1] as (e: unknown) => Promise<void>;

      await handler({ event_type: eventType, tenant_id: 't', actor_id: 'a', payload: {} });
      expect(mockHandleEvent).toHaveBeenCalledWith(
        expect.objectContaining({ event_type: eventType }),
      );
      mockHandleEvent.mockClear();
    }
  });
});

// ── onModuleDestroy ─────────────────────────────────────────────────────────

describe('onModuleDestroy', () => {
  it('calls kafka.disconnect() on teardown', async () => {
    await consumer.onModuleInit();
    await consumer.onModuleDestroy();
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('catches and swallows disconnect errors without rethrowing', async () => {
    mockDisconnect.mockRejectedValueOnce(new Error('broker unavailable'));
    await consumer.onModuleInit();
    await expect(consumer.onModuleDestroy()).resolves.not.toThrow();
  });
});
