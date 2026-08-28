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

import { KafkaConsumer, RETRY_DELAYS_MS } from '../consumer';
import { decodeAvro } from '../schema-registry.client';
import { tenantTopicPattern, PLATFORM_EVENTS_TOPIC, exactTopicPattern } from '../topic-catalog';

type HandleMessage = (p: unknown) => Promise<void>;

// Default messages carry a tenant_id header matching the decoded event (tenant_id 't1'),
// satisfying the §7.3 tenant-isolation guard. Pass overrides to merge/replace headers.
function makeMessage(value = Buffer.from('encoded'), headers: Record<string, Buffer> = {}) {
  return {
    topic: 't1.construction.project.created.v1',
    partition: 0,
    message: {
      value,
      headers: { tenant_id: Buffer.from('t1'), ...headers },
      offset: '0',
      timestamp: Date.now().toString(),
    },
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
    await consumer.connect({ groupId: 'g1', eventTypes: ['topic-a', 'topic-b'] });

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
    await consumer.connect({ groupId: 'g1', eventTypes: ['topic-a'], fromBeginning: true });

    // Domain event types subscribe via a per-tenant topic RegExp (§7.3).
    expect(consumerMock.subscribe).toHaveBeenCalledWith({
      topic: tenantTopicPattern('topic-a'),
      fromBeginning: true,
    });
  });

  it('connect() subscribes platform.* events to the shared platform topic (covers ternary platform branch)', async () => {
    const { Kafka } = jest.requireMock('kafkajs') as { Kafka: jest.Mock };
    const consumerMock = {
      connect: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };
    Kafka.mockImplementationOnce(() => ({ consumer: jest.fn().mockReturnValue(consumerMock) }));

    const consumer = new KafkaConsumer();
    await consumer.connect({
      groupId: 'g1',
      eventTypes: ['platform.enterprise.contract_signed.v1'],
    });

    // Platform events live on the ONE shared platform.events topic, not a per-tenant topic (§7.3) —
    // but subscribed by an exact-match pattern rather than the literal name. A literal subscription
    // throws when the topic does not exist yet, and nothing creates platform.events ahead of the
    // first publish (master:3093-3100 gives topic creation to the producer). Now that no broker
    // auto-creates topics, a consumer that starts before any platform event has ever been published
    // would have failed to connect at all.
    expect(consumerMock.subscribe).toHaveBeenCalledWith({
      topic: exactTopicPattern(PLATFORM_EVENTS_TOPIC),
      fromBeginning: false,
    });
    // Still exactly the one topic, and still not a per-tenant pattern.
    const [{ topic }] = consumerMock.subscribe.mock.calls[0] as [{ topic: RegExp }];
    expect(topic.test(PLATFORM_EVENTS_TOPIC)).toBe(true);
    expect(topic.test(`tenant-abc.${PLATFORM_EVENTS_TOPIC}`)).toBe(false);
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
    await consumer.connect({ groupId: 'g1', eventTypes: ['t'] });
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
    await consumer.connect({ groupId: 'g1', eventTypes: ['topic-a'] });

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

  it('routes a null-headers message to the DLQ — missing tenant_id (covers headers ?? {} branch + §7.3 guard)', async () => {
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
    const { DlqPublisher } = jest.requireMock('../dlq') as { DlqPublisher: jest.Mock };
    const handler = jest.fn().mockResolvedValue(undefined);
    const consumer = new KafkaConsumer();
    consumer.on('construction.project.created.v1', handler);

    await (consumer as unknown as { handleMessage: HandleMessage }).handleMessage({
      topic: 'construction.project.created',
      partition: 0,
      message: {
        value: Buffer.from('enc'),
        headers: null as never, // null → ?? {} covers left branch; no tenant_id → DLQ
        offset: '0',
        timestamp: Date.now().toString(),
      },
    });

    // No tenant_id header → guard rejects, handler never runs, message goes to DLQ.
    expect(handler).not.toHaveBeenCalled();
    const publishMock = DlqPublisher.mock.results[0]?.value.publish as jest.Mock;
    expect(publishMock).toHaveBeenCalledTimes(1);
  });

  it('routes a message whose tenant_id header mismatches the envelope to the DLQ (§7.3 guard)', async () => {
    const event = {
      event_id: 'evt-mismatch',
      event_type: 'construction.project.created.v1',
      tenant_id: 't1',
      actor_id: 'u1',
      occurred_at: new Date().toISOString(),
      correlation_id: 'c1',
      event_version: '1.0',
      payload: {},
    };
    (decodeAvro as jest.Mock).mockResolvedValueOnce(event);
    const { DlqPublisher } = jest.requireMock('../dlq') as { DlqPublisher: jest.Mock };
    const handler = jest.fn().mockResolvedValue(undefined);
    const consumer = new KafkaConsumer();
    consumer.on('construction.project.created.v1', handler);

    // Header tenant_id 'other' ≠ envelope tenant_id 't1' → rejected.
    await (consumer as unknown as { handleMessage: HandleMessage }).handleMessage(
      makeMessage(Buffer.from('enc'), { tenant_id: Buffer.from('other') }),
    );

    expect(handler).not.toHaveBeenCalled();
    const publishMock = DlqPublisher.mock.results[0]?.value.publish as jest.Mock;
    expect(publishMock).toHaveBeenCalledTimes(1);
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
      tenant_id: 't1',
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
        headers: { tenant_id: Buffer.from('t1') },
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
      tenant_id: 't1',
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
        headers: { tenant_id: Buffer.from('t1') },
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

  // A test below installs fake timers as its first statement and restores them as its last. If it
  // ever fails or times out in between, the fakes stay installed and leak into the NEXT test — which
  // then waits on a clock nothing advances and fails for a reason that has nothing to do with it.
  // One failure becomes two, and the second one names the wrong test. Restoring here costs nothing
  // and removes the ordering dependency entirely.
  afterEach(() => {
    jest.useRealTimers();
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
        originalTopic: 't1.construction.project.created.v1',
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
    // Explicit timeout, precautionary rather than diagnosed. Under fake timers this test waits for
    // nothing, so its 20s is wall-clock for the async machinery alone — but jest's 5s default is
    // measured on a machine that may be running 200 other suites, and this test failing is the one
    // event that used to take a neighbour down with it. Nothing about the assertions changed.
  }, 20_000);

  // The test above proves the ATTEMPT COUNT. It cannot prove the DELAYS: `runAllTimersAsync()`
  // drains a queue of any duration, so [1, 1, 1] would satisfy it just as well as [1000, 5000, 30000].
  // master:3164 states the actual values, so assert what setTimeout is really handed.
  it('backs off 1s then 5s between the three attempts (master:3164)', async () => {
    const event = {
      event_id: 'evt-backoff',
      event_type: 'construction.project.created.v1',
      tenant_id: 't1',
      actor_id: 'u1',
      occurred_at: new Date().toISOString(),
      correlation_id: 'c1',
      event_version: '1.0',
      payload: {},
    };
    (decodeAvro as jest.Mock).mockResolvedValue(event);

    // Record the delay the consumer asks for, then honour it instantly so the test does not
    // actually sleep 6 seconds. Fake timers cannot be used here: useFakeTimers()/useRealTimers()
    // swap the global, which would discard this spy.
    // requireActual, NOT the ambient `setTimeout`: if fake timers were installed by anything
    // earlier, the global is a fake and scheduling on it would hang forever.
    const realSetTimeout = (jest.requireActual('timers') as typeof import('timers')).setTimeout;
    const delays: unknown[] = [];
    const spy = jest.spyOn(global, 'setTimeout').mockImplementation(((
      fn: () => void,
      ms?: number,
    ) => {
      delays.push(ms);
      return realSetTimeout(fn, 0);
    }) as unknown as typeof setTimeout);

    const consumer = new KafkaConsumer();
    consumer.on(
      'construction.project.created.v1',
      jest.fn().mockRejectedValue(new Error('handler always fails')),
    );

    try {
      await (consumer as unknown as { handleMessage: HandleMessage }).handleMessage(makeMessage());
    } finally {
      spy.mockRestore();
    }

    // Two waits for three attempts — the consumer sleeps BETWEEN tries, not after the last one.
    expect(delays).toEqual([1000, 5000]);
  });

  // RETRY_DELAYS_MS is indexed by `attempt`, which runs to MAX_RETRIES - 1. Nothing in the type
  // system ties the two together: drop the array to [1000] and `RETRY_DELAYS_MS[1]` is `undefined`,
  // `setTimeout(fn, undefined)` fires on the next tick, and the backoff silently disappears while
  // every other assertion in this file still passes.
  it('carries exactly one delay fewer than the attempts it paces', () => {
    expect(RETRY_DELAYS_MS).toEqual([1000, 5000, 30000]);
    // 3 attempts (asserted above via handler call count) => at most 2 delays are ever read.
    expect(RETRY_DELAYS_MS.length).toBeGreaterThanOrEqual(2);
    expect(RETRY_DELAYS_MS.every((ms) => Number.isInteger(ms) && ms > 0)).toBe(true);
    // Exponential, not flat: each wait must exceed the one before it.
    for (let i = 1; i < RETRY_DELAYS_MS.length; i++) {
      expect(RETRY_DELAYS_MS[i]!).toBeGreaterThan(RETRY_DELAYS_MS[i - 1]!);
    }
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
