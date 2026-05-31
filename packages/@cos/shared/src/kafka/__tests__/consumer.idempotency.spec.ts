// Unit tests for KafkaConsumer idempotency — spec §Phase 8 / QM-9
// Verifies that duplicate event_ids are skipped (not processed twice).

const redisMock: Record<string, string> = {};

jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    set: jest.fn(async (key: string, value: string, ...args: unknown[]) => {
      // NX flag: only set if not exists
      const nx = args.includes('NX');
      if (nx && redisMock[key] !== undefined) return null;
      redisMock[key] = value;
      return 'OK';
    }),
    del: jest.fn(async (...keys: string[]) => { keys.forEach(k => delete redisMock[k]); }),
    get: jest.fn(async (key: string) => redisMock[key] ?? null),
  })),
);

jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation(() => ({
    consumer: jest.fn().mockReturnValue({
      connect: jest.fn(),
      subscribe: jest.fn(),
      run: jest.fn(),
      disconnect: jest.fn(),
    }),
  })),
}));

jest.mock('../schema-registry.client', () => ({
  decodeAvro: jest.fn(),
}));

import { KafkaConsumer } from '../consumer';
import { decodeAvro } from '../schema-registry.client';

describe('KafkaConsumer idempotency', () => {
  beforeEach(() => {
    Object.keys(redisMock).forEach(k => delete redisMock[k]);
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
