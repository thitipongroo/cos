// Unit tests — TasksDelayConsumer. Subscription, the blockable-status rule, and every skip path.
//
// §Phase 6 completion gate 6 states as fact that construction.delay.detected.v1 "auto-sets
// task.status = BLOCKED". The consumer narrows that: only NOT_STARTED and IN_PROGRESS move, because
// the event carries no ordering guarantee against a completion and a late or replayed forecast would
// otherwise un-finish work that is already done (master §Phase 6 gate 6, SCOPE OF THE AUTOMATIC
// TRANSITION). Each of those branches is exercised here — they are the reason the rule exists.

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

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

jest.mock('@nestjs/core', () => {
  const actual = jest.requireActual<Record<string, unknown>>('@nestjs/core');
  return {
    ...actual,
    ContextIdFactory: { create: jest.fn().mockReturnValue({ id: 1 }) },
  };
});

import { TasksDelayConsumer } from '../tasks.delay.consumer';
import type { TasksService } from '../tasks.service';

const EVENT_TYPE = 'construction.delay.detected.v1';
const TASK_ID = 'task-001';

const mockGetTask = jest.fn();
const mockUpdateTask = jest.fn().mockResolvedValue({ task_id: TASK_ID, status: 'BLOCKED' });
const mockSvc: Partial<TasksService> = {
  getTask: mockGetTask,
  updateTask: mockUpdateTask,
} as Partial<TasksService>;

const mockRegisterRequest = jest.fn();
const mockResolve = jest.fn().mockResolvedValue(mockSvc);
const mockModuleRef = { registerRequestByContextId: mockRegisterRequest, resolve: mockResolve };

function delayEvent(payload: Record<string, unknown> = {}) {
  return {
    event_type: EVENT_TYPE,
    tenant_id: 'tenant-001',
    actor_id: 'ai-gateway',
    payload: {
      project_id: 'proj-001',
      task_id: TASK_ID,
      delay_days: 9,
      cause: 'OTHER',
      detected_by: 'AI_FORECAST',
      severity: 'HIGH',
      ...payload,
    },
  } as never;
}

let consumer: TasksDelayConsumer;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetTask.mockResolvedValue({ task_id: TASK_ID, status: 'IN_PROGRESS' });
  mockUpdateTask.mockResolvedValue({ task_id: TASK_ID, status: 'BLOCKED' });
  mockResolve.mockResolvedValue(mockSvc);
  consumer = new TasksDelayConsumer(mockModuleRef as never);
});

describe('subscription', () => {
  it('registers a handler for the delay event and joins its own consumer group', async () => {
    await consumer.onModuleInit();

    expect(mockOn).toHaveBeenCalledWith(EVENT_TYPE, expect.any(Function));
    expect(mockConnect).toHaveBeenCalledWith({
      groupId: 'tasks-delay.shared',
      eventTypes: [EVENT_TYPE],
      fromBeginning: false,
    });
  });

  it('routes a delivered message into handle()', async () => {
    // The registered callback is the only path from Kafka into this class; if it is wired to
    // something else the consumer connects and silently does nothing.
    await consumer.onModuleInit();
    const handler = mockOn.mock.calls[0][1] as (e: unknown) => Promise<void>;

    await handler(delayEvent());

    expect(mockUpdateTask).toHaveBeenCalledWith(TASK_ID, { status: 'BLOCKED' });
  });

  it('disconnects on shutdown', async () => {
    await consumer.onModuleDestroy();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('does not throw when disconnect fails', async () => {
    // A failing disconnect must not take the process down during shutdown.
    mockDisconnect.mockRejectedValueOnce(new Error('broker gone'));
    await expect(consumer.onModuleDestroy()).resolves.toBeUndefined();
  });
});

describe('the blockable-status rule', () => {
  it.each(['NOT_STARTED', 'IN_PROGRESS'])('blocks a task that is %s', async (status) => {
    mockGetTask.mockResolvedValue({ task_id: TASK_ID, status });

    await consumer.handle(delayEvent());

    expect(mockUpdateTask).toHaveBeenCalledWith(TASK_ID, { status: 'BLOCKED' });
  });

  it.each(['COMPLETED', 'CANCELLED'])('leaves a %s task alone', async (status) => {
    // The literal reading of the gate would un-finish this work. The event has no ordering
    // guarantee against the completion, so a late or replayed forecast must not reopen it.
    mockGetTask.mockResolvedValue({ task_id: TASK_ID, status });

    await consumer.handle(delayEvent());

    expect(mockUpdateTask).not.toHaveBeenCalled();
  });

  it('does not write again for a task that is already BLOCKED', async () => {
    mockGetTask.mockResolvedValue({ task_id: TASK_ID, status: 'BLOCKED' });

    await consumer.handle(delayEvent());

    expect(mockUpdateTask).not.toHaveBeenCalled();
  });
});

describe('skip paths', () => {
  it('does nothing when the forecast names no task', async () => {
    // task_id is nullable in the schema: a PROJECT-level forecast blocks nothing. The Knowledge
    // Graph still records it, which is why this is a skip rather than an error.
    await consumer.handle(delayEvent({ task_id: null }));

    expect(mockResolve).not.toHaveBeenCalled();
    expect(mockUpdateTask).not.toHaveBeenCalled();
  });

  it('does nothing when task_id is not a string', async () => {
    await consumer.handle(delayEvent({ task_id: 42 }));

    expect(mockUpdateTask).not.toHaveBeenCalled();
  });

  it('does nothing when task_id is an empty string', async () => {
    await consumer.handle(delayEvent({ task_id: '' }));

    expect(mockUpdateTask).not.toHaveBeenCalled();
  });

  it('swallows a missing task rather than failing the message', async () => {
    // getTask throws 404 for a task deleted between forecast and delivery. Rethrowing would send a
    // valid event to the DLQ over a task that no longer matters.
    mockGetTask.mockRejectedValue(new Error('not found'));

    await expect(consumer.handle(delayEvent())).resolves.toBeUndefined();
    expect(mockUpdateTask).not.toHaveBeenCalled();
  });
});

describe('tenant context', () => {
  it('resolves the service against the event tenant, not an ambient one', async () => {
    // TasksService is REQUEST-scoped. Resolving it without the event's tenant would apply one
    // tenant's forecast to another tenant's task.
    await consumer.handle(delayEvent());

    expect(mockRegisterRequest).toHaveBeenCalledWith({ tenantId: 'tenant-001' }, { id: 1 });
    expect(mockResolve).toHaveBeenCalledWith(expect.anything(), { id: 1 }, { strict: false });
  });
});
