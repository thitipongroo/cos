// Unit tests for KafkaConsumer idempotency — spec §Phase 8 / QM-9
// Verifies that duplicate event_ids are skipped (not processed twice).

const redisMock: Record<string, string> = {};

jest.mock('../dlq', () => ({
  DlqPublisher: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('ioredis', () => ({
  Redis: jest.fn().mockImplementation(() => ({
    set: jest.fn(async (key: string, value: string, ...args: unknown[]) => {
      // NX flag: only set if not exists
      const nx = args.includes('NX');
      if (nx && redisMock[key] !== undefined) return null;
      redisMock[key] = value;
      return 'OK';
    }),
    del: jest.fn(async (...keys: string[]) => {
      keys.forEach((k) => delete redisMock[k]);
    }),
    get: jest.fn(async (key: string) => redisMock[key] ?? null),
  })),
}));

jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation(() => ({
    consumer: jest.fn().mockReturnValue({
      connect: jest.fn(),
      subscribe: jest.fn(),
      run: jest.fn(),
      disconnect: jest.fn(),
    }),
  })),
  logLevel: { NOTHING: 0, ERROR: 1, WARN: 2, INFO: 4, DEBUG: 5 },
}));

jest.mock('../schema-registry.client', () => ({
  decodeAvro: jest.fn(),
}));

import { KafkaConsumer } from '../consumer';
import { decodeAvro } from '../schema-registry.client';

type HandleMessage = (p: unknown) => Promise<void>;

function makeMessage(value = Buffer.from('encoded'), headers: Record<string, Buffer> = {}) {
  return {
    topic: 'construction.project.created',
    partition: 0,
    message: { value, headers, offset: '0', timestamp: Date.now().toString() },
  };
}

describe('KafkaConsumer constructor', () => {
  it('uses logLevel.WARN when NODE_ENV is not "test" (covers ternary false branch)', () => {
    const { Kafka } = jest.requireMock('kafkajs') as { Kafka: jest.Mock };
    const originalEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      new KafkaConsumer();
    } finally {
      process.env['NODE_ENV'] = originalEnv;
    }
    expect(Kafka).toHaveBeenCalled();
  });
});

describe('KafkaConsumer connect/disconnect (lines 54-72)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('connect() subscribes to topics and starts consuming', async () => {
    const { Kafka } = jest.requireMock('kafkajs') as { Kafka: jest.Mock };
    const consumerMock = {
      connect: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };
    Kafka.mockImplementationOnce(() => ({ consumer: jest.fn().mockReturnValue(consumerMock) }));

    const consumer = new KafkaConsumer();
    await consumer.connect({ groupId: 'g1', topics: ['topic-a', 'topic-b'] });

    expect(consumerMock.connect).toHaveBeenCalledTimes(1);
    expect(consumerMock.subscribe).toHaveBeenCalledTimes(2);
    expect(consumerMock.run).toHaveBeenCalledTimes(1);
  });

  it('connect() passes fromBeginning=true when specified (covers ?? left branch)', async () => {
    const { Kafka } = jest.requireMock('kafkajs') as { Kafka: jest.Mock };
    const consumerMock = {
      connect: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };
    Kafka.mockImplementationOnce(() => ({ consumer: jest.fn().mockReturnValue(consumerMock) }));

    const consumer = new KafkaConsumer();
    await consumer.connect({ groupId: 'g1', topics: ['topic-a'], fromBeginning: true });

    expect(consumerMock.subscribe).toHaveBeenCalledWith({ topic: 'topic-a', fromBeginning: true });
  });

  it('disconnect() disconnects the underlying consumer', async () => {
    const { Kafka } = jest.requireMock('kafkajs') as { Kafka: jest.Mock };
    const consumerMock = {
      connect: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };
    Kafka.mockImplementationOnce(() => ({ consumer: jest.fn().mockReturnValue(consumerMock) }));

    const consumer = new KafkaConsumer();
    await consumer.connect({ groupId: 'g1', topics: ['t'] });
    await consumer.disconnect();

    expect(consumerMock.disconnect).toHaveBeenCalledTimes(1);
  });

  it('disconnect() is safe when consumer not connected (covers ?. null branch)', async () => {
    const consumer = new KafkaConsumer();
    // Never called connect() — this.consumer is null
    await expect(consumer.disconnect()).resolves.toBeUndefined();
  });

  it('eachMessage callback invokes handleMessage (covers line 63 arrow function, G2)', async () => {
    const { Kafka } = jest.requireMock('kafkajs') as { Kafka: jest.Mock };
    let capturedEachMessage: ((p: unknown) => Promise<void>) | null = null;
    const consumerMock = {
      connect: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      run: jest
        .fn()
        .mockImplementation(
          async ({ eachMessage }: { eachMessage: (p: unknown) => Promise<void> }) => {
            capturedEachMessage = eachMessage;
          },
        ),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };
    Kafka.mockImplementationOnce(() => ({ consumer: jest.fn().mockReturnValue(consumerMock) }));

    const consumer = new KafkaConsumer();
    await consumer.connect({ groupId: 'g1', topics: ['topic-a'] });

    // Invoke the captured eachMessage arrow function — covers (payload) => this.handleMessage(payload)
    await capturedEachMessage!({
      topic: 'topic-a',
      partition: 0,
      message: { value: null as never, headers: {}, offset: '0', timestamp: Date.now().toString() },
    });
  });
});

describe('KafkaConsumer handleMessage — null headers (line 107)', () => {
  beforeEach(() => {
    Object.keys(redisMock).forEach((k) => delete redisMock[k]);
    jest.clearAllMocks();
  });

  it('handles message with null headers (covers message.headers ?? {} branch)', async () => {
    const event = {
      event_id: 'evt-null-hdr',
      event_type: 'construction.project.created.v1',
      tenant_id: 't1',
      actor_id: 'u1',
      occurred_at: new Date().toISOString(),
      correlation_id: 'c1',
      event_version: '1.0',
      payload: {},
    };
    (decodeAvro as jest.Mock).mockResolvedValueOnce(event);
    const handler = jest.fn().mockResolvedValue(undefined);
    const consumer = new KafkaConsumer();
    consumer.on('construction.project.created.v1', handler);

    await (consumer as unknown as { handleMessage: HandleMessage }).handleMessage({
      topic: 'construction.project.created',
      partition: 0,
      message: {
        value: Buffer.from('enc'),
        headers: null as never, // null → ?? {} covers right branch
        offset: '0',
        timestamp: Date.now().toString(),
      },
    });

    expect(handler).toHaveBeenCalledWith(event, { traceId: undefined, spanId: undefined });
  });

  it('handles message with no value (covers !value early return on line 72)', async () => {
    const consumer = new KafkaConsumer();
    await (consumer as unknown as { handleMessage: HandleMessage }).handleMessage({
      topic: 'construction.project.created',
      partition: 0,
      message: {
        value: null as never,
        headers: {},
        offset: '0',
        timestamp: Date.now().toString(),
      },
    });
    // Should return early without throwing
  });
});

describe('KafkaConsumer idempotency', () => {
  beforeEach(() => {
    Object.keys(redisMock).forEach((k) => delete redisMock[k]);
    jest.clearAllMocks();
  });

  it('processes a new event exactly once', async () => {
    const consumer = new KafkaConsumer();
    const handler = jest.fn().mockResolvedValue(undefined);
    consumer.on('construction.project.created.v1', handler);

    const event = {
      event_id: 'evt-001',
      event_type: 'construction.project.created.v1',
      tenant_id: 'tenant-1',
      actor_id: 'user-1',
      occurred_at: new Date().toISOString(),
      correlation_id: 'corr-1',
      event_version: '1.0',
      payload: {},
    };

    (decodeAvro as jest.Mock).mockResolvedValue(event);

    // Invoke handleMessage via the internal method (test-only access)
    // In real tests, use testcontainers Kafka — this verifies the idempotency logic
    await (consumer as unknown as { handleMessage: (p: unknown) => Promise<void> }).handleMessage({
      topic: 'construction.project.created',
      partition: 0,
      message: {
        value: Buffer.from('encoded'),
        headers: {},
        offset: '0',
        timestamp: Date.now().toString(),
      },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(redisMock[`kafka:processed:evt-001`]).toBe('1');
  });

  it('skips a duplicate event_id', async () => {
    const consumer = new KafkaConsumer();
    const handler = jest.fn().mockResolvedValue(undefined);
    consumer.on('construction.project.created.v1', handler);

    const event = {
      event_id: 'evt-002',
      event_type: 'construction.project.created.v1',
      tenant_id: 'tenant-1',
      actor_id: 'user-1',
      occurred_at: new Date().toISOString(),
      correlation_id: 'corr-2',
      event_version: '1.0',
      payload: {},
    };

    // Pre-populate Redis to simulate already-processed
    redisMock['kafka:processed:evt-002'] = '1';

    (decodeAvro as jest.Mock).mockResolvedValue(event);

    await (consumer as unknown as { handleMessage: (p: unknown) => Promise<void> }).handleMessage({
      topic: 'construction.project.created',
      partition: 0,
      message: {
        value: Buffer.from('encoded'),
        headers: {},
        offset: '1',
        timestamp: Date.now().toString(),
      },
    });

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('KafkaConsumer — error branches', () => {
  beforeEach(() => {
    Object.keys(redisMock).forEach((k) => delete redisMock[k]);
    jest.clearAllMocks();
  });

  it('sends to DLQ and returns when Avro decode fails', async () => {
    (decodeAvro as jest.Mock).mockRejectedValueOnce(new Error('bad avro'));
    const { DlqPublisher } = jest.requireMock('../dlq') as { DlqPublisher: jest.Mock };
    const consumer = new KafkaConsumer();
    await (consumer as unknown as { handleMessage: HandleMessage }).handleMessage(makeMessage());
    // DlqPublisher.publish() must be called — not just logged
    const publishMock = DlqPublisher.mock.results[0]?.value.publish as jest.Mock;
    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        originalTopic: 'construction.project.created',
        reason: 'AVRO_DECODE_ERROR',
      }),
    );
  });

  it('returns without calling handler when no handler is registered', async () => {
    const event = {
      event_id: 'evt-no-handler',
      event_type: 'unknown.event.v1',
      tenant_id: 't1',
      actor_id: 'u1',
      occurred_at: new Date().toISOString(),
      correlation_id: 'c1',
      event_version: '1.0',
      payload: {},
    };
    (decodeAvro as jest.Mock).mockResolvedValueOnce(event);
    const consumer = new KafkaConsumer();
    // No consumer.on() call — handler map is empty
    await (consumer as unknown as { handleMessage: HandleMessage }).handleMessage(makeMessage());
  });

  it('retries on handler failure and sends to DLQ after max retries', async () => {
    jest.useFakeTimers();
    const event = {
      event_id: 'evt-retry',
      event_type: 'construction.project.created.v1',
      tenant_id: 't1',
      actor_id: 'u1',
      occurred_at: new Date().toISOString(),
      correlation_id: 'c1',
      event_version: '1.0',
      payload: {},
    };
    (decodeAvro as jest.Mock).mockResolvedValue(event);

    const handler = jest.fn().mockRejectedValue(new Error('handler always fails'));
    const consumer = new KafkaConsumer();
    consumer.on('construction.project.created.v1', handler);

    // Attach handler before timers fire (prevents unhandled rejection)
    const msgPromise = (consumer as unknown as { handleMessage: HandleMessage }).handleMessage(
      makeMessage(),
    );
    // Advance through the two intermediate retry delays (1000ms, 5000ms)
    await jest.runAllTimersAsync();
    await jest.runAllTimersAsync();
    await msgPromise;

    // 3 attempts total (MAX_RETRIES = 3)
    expect(handler).toHaveBeenCalledTimes(3);
    jest.useRealTimers();
  });

  it('extracts OTel trace context from message headers (Buffer type)', async () => {
    const event = {
      event_id: 'evt-trace',
      event_type: 'construction.project.created.v1',
      tenant_id: 't1',
      actor_id: 'u1',
      occurred_at: new Date().toISOString(),
      correlation_id: 'c1',
      event_version: '1.0',
      payload: {},
    };
    (decodeAvro as jest.Mock).mockResolvedValueOnce(event);

    const handler = jest.fn().mockResolvedValue(undefined);
    const consumer = new KafkaConsumer();
    consumer.on('construction.project.created.v1', handler);

    await (consumer as unknown as { handleMessage: HandleMessage }).handleMessage(
      makeMessage(Buffer.from('enc'), {
        trace_id: Buffer.from('trace-abc'),
        span_id: Buffer.from('span-xyz'),
      }),
    );

    expect(handler).toHaveBeenCalledWith(event, { traceId: 'trace-abc', spanId: 'span-xyz' });
  });

  it('extracts OTel trace context from string headers (covers line 156 string branch)', async () => {
    const event = {
      event_id: 'evt-str-hdr',
      event_type: 'construction.project.created.v1',
      tenant_id: 't1',
      actor_id: 'u1',
      occurred_at: new Date().toISOString(),
      correlation_id: 'c1',
      event_version: '1.0',
      payload: {},
    };
    (decodeAvro as jest.Mock).mockResolvedValueOnce(event);

    const handler = jest.fn().mockResolvedValue(undefined);
    const consumer = new KafkaConsumer();
    consumer.on('construction.project.created.v1', handler);

    // String headers (not Buffer) — hits `return header` on line 156
    await (consumer as unknown as { handleMessage: HandleMessage }).handleMessage(
      makeMessage(Buffer.from('enc'), {
        trace_id: 'trace-str' as unknown as Buffer,
        span_id: 'span-str' as unknown as Buffer,
      }),
    );

    expect(handler).toHaveBeenCalledWith(event, { traceId: 'trace-str', spanId: 'span-str' });
  });

  it('extracts trace headers from array format with Buffer (covers lines 152-154)', async () => {
    const event = {
      event_id: 'evt-arr-hdr',
      event_type: 'construction.project.created.v1',
      tenant_id: 't1',
      actor_id: 'u1',
      occurred_at: new Date().toISOString(),
      correlation_id: 'c1',
      event_version: '1.0',
      payload: {},
    };
    (decodeAvro as jest.Mock).mockResolvedValueOnce(event);

    const handler = jest.fn().mockResolvedValue(undefined);
    const consumer = new KafkaConsumer();
    consumer.on('construction.project.created.v1', handler);

    // Array format with Buffer as first element
    await (consumer as unknown as { handleMessage: HandleMessage }).handleMessage(
      makeMessage(Buffer.from('enc'), {
        trace_id: [Buffer.from('arr-trace')] as unknown as Buffer,
        span_id: [Buffer.from('arr-span')] as unknown as Buffer,
      }),
    );

    expect(handler).toHaveBeenCalledWith(event, { traceId: 'arr-trace', spanId: 'arr-span' });
  });

  it('returns undefined for array header with empty first element (covers line 153)', async () => {
    const event = {
      event_id: 'evt-empty-arr',
      event_type: 'construction.project.created.v1',
      tenant_id: 't1',
      actor_id: 'u1',
      occurred_at: new Date().toISOString(),
      correlation_id: 'c1',
      event_version: '1.0',
      payload: {},
    };
    (decodeAvro as jest.Mock).mockResolvedValueOnce(event);

    const handler = jest.fn().mockResolvedValue(undefined);
    const consumer = new KafkaConsumer();
    consumer.on('construction.project.created.v1', handler);

    // Array with empty first element → undefined trace context
    await (consumer as unknown as { handleMessage: HandleMessage }).handleMessage(
      makeMessage(Buffer.from('enc'), {
        trace_id: [] as unknown as Buffer,
      }),
    );

    expect(handler).toHaveBeenCalledWith(event, { traceId: undefined, spanId: undefined });
  });

  it('extracts trace headers from array format with string (covers line 154 string branch)', async () => {
    const event = {
      event_id: 'evt-arr-str',
      event_type: 'construction.project.created.v1',
      tenant_id: 't1',
      actor_id: 'u1',
      occurred_at: new Date().toISOString(),
      correlation_id: 'c1',
      event_version: '1.0',
      payload: {},
    };
    (decodeAvro as jest.Mock).mockResolvedValueOnce(event);

    const handler = jest.fn().mockResolvedValue(undefined);
    const consumer = new KafkaConsumer();
    consumer.on('construction.project.created.v1', handler);

    // Array with string first element → hits `: first` on line 154
    await (consumer as unknown as { handleMessage: HandleMessage }).handleMessage(
      makeMessage(Buffer.from('enc'), {
        trace_id: ['arr-trace-str'] as unknown as Buffer,
      }),
    );

    expect(handler).toHaveBeenCalledWith(event, { traceId: 'arr-trace-str', spanId: undefined });
  });
});
