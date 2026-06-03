// Unit tests for KafkaProducer

const sendMock = jest.fn().mockResolvedValue({ topicName: 'test', partition: 0 });
const connectMock = jest.fn().mockResolvedValue(undefined);
const disconnectMock = jest.fn().mockResolvedValue(undefined);

jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation(() => ({
    producer: jest.fn().mockReturnValue({
      connect: connectMock,
      disconnect: disconnectMock,
      send: sendMock,
    }),
  })),
  CompressionTypes: { GZIP: 2 },
  logLevel: { NOTHING: 0, ERROR: 1, WARN: 2, INFO: 4, DEBUG: 5 },
}));

jest.mock('../schema-registry.client', () => ({
  ensureCompatibilityMode: jest.fn().mockResolvedValue(undefined),
  registerSchema: jest.fn().mockResolvedValue(42),
  encodeAvro: jest.fn().mockResolvedValue(Buffer.from('encoded')),
}));

import { KafkaProducer } from '../producer';

describe('KafkaProducer', () => {
  let producer: KafkaProducer;

  beforeEach(async () => {
    jest.clearAllMocks();
    producer = new KafkaProducer();
    await producer.connect();
  });

  afterEach(async () => {
    await producer.disconnect();
  });

  it('connects and disconnects', async () => {
    expect(connectMock).toHaveBeenCalledTimes(1);
    await producer.disconnect();
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });

  it('publishes event to correct topic', async () => {
    await producer.publish({
      event_type: 'construction.project.created.v1',
      event_version: '1.0',
      tenant_id: 'tenant-1',
      actor_id: 'user-1',
      occurred_at: new Date().toISOString(),
      correlation_id: 'corr-1',
      payload: { project_id: 'p-1' },
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.topic).toBe('construction.project.created');
    expect(call.messages[0].key).toBe('tenant-1');
  });

  it('propagates OTel trace headers when provided', async () => {
    await producer.publish(
      {
        event_type: 'site.report.created.v1',
        event_version: '1.0',
        tenant_id: 'tenant-1',
        actor_id: 'user-1',
        occurred_at: new Date().toISOString(),
        correlation_id: 'corr-1',
        payload: {},
      },
      { traceId: 'abc123', spanId: 'def456' },
    );

    const headers = sendMock.mock.calls[0][0].messages[0].headers;
    expect(headers['trace_id']).toBe('abc123');
    expect(headers['span_id']).toBe('def456');
  });

  it('uses 0000000000000000 as default spanId when only traceId provided (covers ?? branch)', async () => {
    await producer.publish(
      {
        event_type: 'site.report.created.v1',
        event_version: '1.0',
        tenant_id: 'tenant-1',
        actor_id: 'user-1',
        occurred_at: new Date().toISOString(),
        correlation_id: 'corr-1',
        payload: {},
      },
      { traceId: 'abc123' }, // no spanId → ?? '0000000000000000'
    );

    const headers = sendMock.mock.calls[0][0].messages[0].headers;
    expect(headers['traceparent']).toContain('0000000000000000');
    expect(headers['trace_id']).toBe('abc123');
    expect(headers['span_id']).toBeUndefined();
  });

  it('throws when publish called before connect', async () => {
    const unconnectedProducer = new KafkaProducer();
    await expect(
      unconnectedProducer.publish({
        event_type: 'construction.project.created.v1',
        event_version: '1.0',
        tenant_id: 't',
        actor_id: 'u',
        occurred_at: '',
        correlation_id: 'c',
        payload: {},
      }),
    ).rejects.toThrow('not connected');
  });

  it('throws for unknown event type', async () => {
    await expect(
      producer.publish({
        event_type: 'unknown.event.type.v1',
        event_version: '1.0',
        tenant_id: 't',
        actor_id: 'u',
        occurred_at: '',
        correlation_id: 'c',
        payload: {},
      }),
    ).rejects.toThrow('No Avro schema');
  });
});
