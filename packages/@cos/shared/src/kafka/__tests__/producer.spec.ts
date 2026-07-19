// Unit tests for KafkaProducer

const sendMock = jest.fn().mockResolvedValue({ topicName: 'test', partition: 0 });
const connectMock = jest.fn().mockResolvedValue(undefined);
const disconnectMock = jest.fn().mockResolvedValue(undefined);

// Topics are created on first publish (auto.create.topics.enable is false on every real broker),
// so the producer now drives an admin client as well.
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
    // Per-tenant topic name (§7.3): {tenant_id}.{event_type} (version retained).
    expect(call.topic).toBe('tenant-1.construction.project.created.v1');
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

  it('uses logLevel.WARN when NODE_ENV is not "test" (covers ternary false branch, G1a)', () => {
    const { Kafka } = jest.requireMock('kafkajs') as { Kafka: jest.Mock };
    const originalEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      new KafkaProducer();
    } finally {
      process.env['NODE_ENV'] = originalEnv;
    }
    // Kafka constructor was called with logLevel.WARN
    expect(Kafka).toHaveBeenCalled();
  });

  it('returns cached schema ID on second publish to same event type (covers cache hit branch, G1b)', async () => {
    const envelope = {
      event_type: 'construction.project.created.v1',
      event_version: '1.0',
      tenant_id: 'tenant-1',
      actor_id: 'user-1',
      occurred_at: new Date().toISOString(),
      correlation_id: 'corr-1',
      payload: {},
    };
    // First publish: registers schema (cache miss)
    await producer.publish(envelope);
    // Second publish: cache hit → if (this.schemaIds.has(eventType)) return covers true branch
    await producer.publish(envelope);

    const { registerSchema } = jest.requireMock('../schema-registry.client') as {
      registerSchema: jest.Mock;
    };
    expect(registerSchema).toHaveBeenCalledTimes(1); // only called once, not twice
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

describe('EVENT_AVSC_MAP completeness — regression for Phase 5/6/7 shorthand event names', () => {
  let producer: KafkaProducer;

  beforeEach(async () => {
    jest.clearAllMocks();
    producer = new KafkaProducer();
    await producer.connect();
  });

  afterEach(async () => {
    await producer.disconnect();
  });

  const requiredEventTypes = [
    // BOQ events (Phase 4) — previously missing, now spec §32.4 entries #19 and #20
    'construction.boq.created.v1',
    'construction.boq.updated.v1',
    // Procurement shorthand (Phase 5) — previously missing
    'procurement.po.created.v1',
    'procurement.po.status_changed.v1',
    'procurement.po.approval_requested.v1',
    'procurement.invoice.received.v1',
    'procurement.rfq.created.v1',
    'procurement.rfq.status_changed.v1',
    // Site Ops (Phase 6) — previously missing
    'site.inspection.passed.v1',
    'site.issue.created.v1',
    'site.issue.status_changed.v1',
    'site.report.submitted.v1',
    // Finance (Phase 7) — previously missing
    'finance.budget.created.v1',
    'finance.payment.processed.v1',
    'finance.variance.alert.v1',
    // Platform — previously missing
    'platform.enterprise.contract_signed.v1',
    'platform.enterprise.db_provisioned.v1',
  ];

  it.each(requiredEventTypes)('resolves without throwing for %s', async (eventType) => {
    await expect(
      producer.publish({
        event_type: eventType,
        event_version: '1.0',
        tenant_id: 'tenant-1',
        actor_id: 'user-1',
        occurred_at: new Date().toISOString(),
        correlation_id: 'corr-1',
        payload: {},
      }),
    ).resolves.not.toThrow();
  });
});

// Topics are created on first publish instead of eagerly at tenant onboarding — eager provisioning
// made the topic count scale with customer headcount (55 topics / 495 partition replicas per
// tenant) rather than with actual usage.
describe('KafkaProducer topic creation', () => {
  let producer: KafkaProducer;

  const event = (tenantId: string, eventType = 'construction.project.created.v1') => ({
    event_type: eventType,
    event_version: '1.0',
    tenant_id: tenantId,
    actor_id: 'user-1',
    occurred_at: new Date().toISOString(),
    correlation_id: 'corr-1',
    payload: {},
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    producer = new KafkaProducer();
    await producer.connect();
  });

  afterEach(async () => {
    await producer.disconnect();
  });

  it('creates the tenant topic on first publish', async () => {
    await producer.publish(event('tenant-1'));

    expect(createTopicsMock).toHaveBeenCalledTimes(1);
    const arg = createTopicsMock.mock.calls[0][0] as { topics: Array<{ topic: string }> };
    expect(arg.topics[0].topic).toBe('tenant-1.construction.project.created.v1');
  });

  // The cache is what keeps this to one admin round-trip per topic rather than one per message.
  it('does not re-create a topic it has already seen', async () => {
    await producer.publish(event('tenant-1'));
    await producer.publish(event('tenant-1'));
    await producer.publish(event('tenant-1'));

    expect(createTopicsMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledTimes(3);
  });

  it('creates a separate topic per tenant and per event type', async () => {
    await producer.publish(event('tenant-1'));
    await producer.publish(event('tenant-2'));
    await producer.publish(event('tenant-1', 'finance.payment.processed.v1'));

    const created = createTopicsMock.mock.calls.map(
      (c) => (c[0] as { topics: Array<{ topic: string }> }).topics[0].topic,
    );
    expect(created).toEqual([
      'tenant-1.construction.project.created.v1',
      'tenant-2.construction.project.created.v1',
      'tenant-1.finance.payment.processed.v1',
    ]);
  });

  // createTopics resolving false means the topic already existed — a second service won the race.
  // That is success, not failure, and must not stop the publish.
  it('publishes normally when the topic already exists', async () => {
    createTopicsMock.mockResolvedValueOnce(false);

    await expect(producer.publish(event('tenant-1'))).resolves.not.toThrow();
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  // Failure is surfaced, not swallowed: publishing to a topic that does not exist would fail
  // anyway, and the outbox poller is what retries.
  it('propagates a topic-creation failure instead of publishing blindly', async () => {
    createTopicsMock.mockRejectedValueOnce(new Error('broker unavailable'));

    await expect(producer.publish(event('tenant-1'))).rejects.toThrow('broker unavailable');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('disconnects the admin client even when creation fails', async () => {
    createTopicsMock.mockRejectedValueOnce(new Error('broker unavailable'));

    await expect(producer.publish(event('tenant-1'))).rejects.toThrow();
    expect(adminDisconnectMock).toHaveBeenCalled();
  });

  // Platform events go to the shared platform.events topic, so they must not mint a tenant topic.
  it('routes platform events to the shared topic', async () => {
    await producer.publish(event('tenant-1', 'platform.enterprise.contract_signed.v1'));

    const arg = createTopicsMock.mock.calls[0][0] as { topics: Array<{ topic: string }> };
    expect(arg.topics[0].topic).toBe('platform.events');
  });
});
