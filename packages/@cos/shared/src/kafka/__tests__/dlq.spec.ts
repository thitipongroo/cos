// Unit tests for DlqPublisher

const sendMock = jest.fn().mockResolvedValue(undefined);
const connectMock = jest.fn().mockResolvedValue(undefined);
const disconnectMock = jest.fn().mockResolvedValue(undefined);

// A tenant's DLQ is created on first failure, so the publisher drives an admin client too.
const adminConnectMock = jest.fn().mockResolvedValue(undefined);
const adminDisconnectMock = jest.fn().mockResolvedValue(undefined);
const createTopicsMock = jest.fn().mockResolvedValue(true);

jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation(() => ({
    producer: jest.fn().mockReturnValue({
      connect: connectMock,
      disconnect: disconnectMock,
      send: sendMock,
    }),
    admin: jest.fn().mockReturnValue({
      connect: adminConnectMock,
      disconnect: adminDisconnectMock,
      createTopics: createTopicsMock,
    }),
  })),
}));

import { DlqPublisher, getDlqTopicNames } from '../dlq';

describe('DlqPublisher', () => {
  let publisher: DlqPublisher;

  beforeEach(async () => {
    jest.clearAllMocks();
    publisher = new DlqPublisher();
    await publisher.connect();
  });

  afterEach(async () => {
    await publisher.disconnect();
  });

  it('publishes to the {tenant_id}.dlq topic', async () => {
    await publisher.publish({
      originalTopic: 'tenant-1.construction.project.created.v1',
      originalValue: Buffer.from('data'),
      reason: 'AVRO_DECODE_ERROR',
      failedAt: new Date().toISOString(),
      retryCount: 3,
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    // Tenant-scoped DLQ (§7.3): {tenant_id}.dlq — one per tenant, shared across its domains.
    expect(call.topic).toBe('tenant-1.dlq');
  });

  it('includes failure metadata in headers', async () => {
    await publisher.publish({
      originalTopic: 'site.report.created',
      originalValue: Buffer.from('data'),
      reason: 'HANDLER_ERROR',
      failedAt: '2026-05-31T00:00:00Z',
      retryCount: 3,
    });

    const headers = sendMock.mock.calls[0][0].messages[0].headers;
    expect(headers['dlq.reason']).toBe('HANDLER_ERROR');
    expect(headers['dlq.retry_count']).toBe('3');
  });

  it('throws when publish called before connect', async () => {
    const unconnected = new DlqPublisher();
    await expect(
      unconnected.publish({
        originalTopic: 'test',
        originalValue: Buffer.from(''),
        reason: '',
        failedAt: '',
        retryCount: 0,
      }),
    ).rejects.toThrow('not connected');
  });
});

describe('getDlqTopicNames', () => {
  it('generates one DLQ topic name per tenant', () => {
    const names = getDlqTopicNames(['tenant-a', 'tenant-b', 'tenant-c']);
    expect(names).toEqual(['tenant-a.dlq', 'tenant-b.dlq', 'tenant-c.dlq']);
  });
});
