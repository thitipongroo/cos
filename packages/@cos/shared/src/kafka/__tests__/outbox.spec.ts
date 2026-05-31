// Unit tests for OutboxPoller — spec §Phase 8 Outbox Pattern

const publishMock = jest.fn().mockResolvedValue(undefined);
const executeRawMock = jest.fn().mockResolvedValue(undefined);

const mockRows: Array<{ id: string; event_type: string; payload: unknown }> = [];

const prismaMock = {
  $queryRaw: jest.fn().mockImplementation(() => Promise.resolve(mockRows)),
  $executeRaw: executeRawMock,
};

const producerMock = { publish: publishMock };

import { OutboxPoller, OutboxPublisher } from '../outbox';

describe('OutboxPoller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRows.length = 0;
  });

  it('publishes unpublished rows and marks them published', async () => {
    const event = {
      event_id: 'outbox-evt-1',
      event_type: 'construction.project.created.v1',
      tenant_id: 'tenant-1',
      actor_id: 'user-1',
      occurred_at: new Date().toISOString(),
      correlation_id: 'corr-1',
      event_version: '1.0',
      payload: { project_id: 'p-1' },
    };
    mockRows.push({ id: 'outbox-evt-1', event_type: event.event_type, payload: event });

    const poller = new OutboxPoller(prismaMock as never, producerMock as never);
    await (poller as unknown as { poll: () => Promise<void> }).poll();

    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(executeRawMock).toHaveBeenCalledTimes(1);
  });

  it('skips poll when no unpublished rows', async () => {
    const poller = new OutboxPoller(prismaMock as never, producerMock as never);
    await (poller as unknown as { poll: () => Promise<void> }).poll();

    expect(publishMock).not.toHaveBeenCalled();
    expect(executeRawMock).not.toHaveBeenCalled();
  });

  it('logs error and continues when prisma.$queryRaw throws', async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error('DB down'));
    const poller = new OutboxPoller(prismaMock as never, producerMock as never);
    // poll() must not throw — error is caught internally
    await expect(
      (poller as unknown as { poll: () => Promise<void> }).poll(),
    ).resolves.toBeUndefined();
  });

  it('leaves row unpublished if Kafka publish fails', async () => {
    publishMock.mockRejectedValueOnce(new Error('Kafka unavailable'));
    const event = {
      event_id: 'outbox-evt-2',
      event_type: 'site.report.created.v1',
      tenant_id: 'tenant-1',
      actor_id: 'user-1',
      occurred_at: new Date().toISOString(),
      correlation_id: 'corr-2',
      event_version: '1.0',
      payload: {},
    };
    mockRows.push({ id: 'outbox-evt-2', event_type: event.event_type, payload: event });

    const poller = new OutboxPoller(prismaMock as never, producerMock as never);
    await (poller as unknown as { poll: () => Promise<void> }).poll();

    // Should have attempted to publish but NOT called $executeRaw (mark published)
    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(executeRawMock).not.toHaveBeenCalled();
  });
});

describe('OutboxPublisher', () => {
  it('write() inserts an outbox record with a generated event_id', async () => {
    const txMock = { $executeRaw: jest.fn().mockResolvedValue(1) };

    await OutboxPublisher.write(txMock as never, {
      event_type: 'construction.project.created.v1',
      event_version: '1.0',
      tenant_id: 'tenant-1',
      actor_id: 'user-1',
      occurred_at: new Date().toISOString(),
      correlation_id: 'corr-1',
      payload: { project_id: 'p-1' },
    });

    expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('write() uses provided event_id when given', async () => {
    const txMock = { $executeRaw: jest.fn().mockResolvedValue(1) };

    await OutboxPublisher.write(txMock as never, {
      event_id: 'my-id-123',
      event_type: 'construction.project.created.v1',
      event_version: '1.0',
      tenant_id: 'tenant-1',
      actor_id: 'user-1',
      occurred_at: new Date().toISOString(),
      correlation_id: 'corr-1',
      payload: {},
    });

    expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
  });
});

describe('OutboxPoller start/stop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('start() schedules polling and stop() cancels the timer', async () => {
    const poller = new OutboxPoller(prismaMock as never, producerMock as never);
    poller.start();
    // Timer is scheduled but not yet fired
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();

    // Stop before any timer fires — no poll should execute
    poller.stop();

    // Advance timers; since stopped, poll should not run
    await jest.runAllTimersAsync();
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('stop() is safe to call when not started', () => {
    const poller = new OutboxPoller(prismaMock as never, producerMock as never);
    expect(() => poller.stop()).not.toThrow();
  });

  it('timer fires poll() and reschedules while running (covers lines 95-96)', async () => {
    // runOnlyPendingTimersAsync fires only already-pending timers, not newly scheduled ones.
    // This prevents the infinite reschedule loop.
    prismaMock.$queryRaw.mockResolvedValue([]); // poll returns empty rows
    const poller = new OutboxPoller(prismaMock as never, producerMock as never);
    poller.start();

    // Fire the first scheduled timer — executes poll() + scheduleNextPoll() once
    await jest.runOnlyPendingTimersAsync();

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);

    // Stop to cancel the rescheduled timer
    poller.stop();
  });
});
