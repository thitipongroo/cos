// Unit tests for OutboxPoller — spec §Phase 8 Outbox Pattern

const publishMock = jest.fn().mockResolvedValue(undefined);
const executeRawMock = jest.fn().mockResolvedValue(undefined);

const mockRows: Array<{ id: string; event_type: string; payload: unknown }> = [];

const prismaMock = {
  $queryRaw: jest.fn().mockImplementation(() => Promise.resolve(mockRows)),
  $executeRaw: executeRawMock,
};

const producerMock = { publish: publishMock };

import { OutboxPoller } from '../outbox';

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
