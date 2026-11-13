// replayTenantDlq / replayTarget (D53, 2026-11-13) — unit level, kafkajs mocked. The same behaviour
// against a real broker: test/kafka/dlq-replay.integration.spec.ts.

const KafkaCtor = jest.fn();
jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation((cfg: unknown) => KafkaCtor(cfg)),
}));
jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import type { Kafka } from 'kafkajs';
import { replayTarget, replayTenantDlq } from '../dlq-replay';

const T = 'tenant-1';
const SINCE = new Date('2026-11-13T10:00:00.000Z');
const BASE = { tenantId: T, since: SINCE, reasonIncludes: 'TenantInactiveError' };

const h = (topic: string, reason: string, failedAt: string) => ({
  'dlq.original_topic': Buffer.from(topic),
  'dlq.reason': Buffer.from(reason),
  'dlq.failed_at': Buffer.from(failedAt),
});
const GOOD = h(
  `${T}.finance.po.created.v1`,
  'TenantInactiveError: tenant x',
  '2026-11-13T10:05:00Z',
);

describe('replayTarget', () => {
  it('returns the original topic for an inactive-tenant failure since the pause', () => {
    expect(replayTarget(GOOD, BASE)).toBe(`${T}.finance.po.created.v1`);
  });

  it.each([
    ['no headers at all', undefined],
    ['another tenant’s topic', h('tenant-2.x.v1', 'TenantInactiveError', '2026-11-13T10:05:00Z')],
    ['no topic header', { 'dlq.reason': Buffer.from('TenantInactiveError') }],
    ['another reason', h(`${T}.x.v1`, 'AVRO_DECODE_ERROR', '2026-11-13T10:05:00Z')],
    ['before the pause', h(`${T}.x.v1`, 'TenantInactiveError', '2026-11-13T09:59:59Z')],
    ['an unreadable time', h(`${T}.x.v1`, 'TenantInactiveError', 'yesterday')],
  ])('leaves an entry with %s', (_l, headers) => {
    expect(replayTarget(headers as never, BASE)).toBeNull();
  });
});

interface Msg {
  partition: number;
  offset: string;
  headers?: Record<string, Buffer>;
}

function fakeKafka(opts: {
  topics?: string[];
  ends?: Array<{ partition: number; high: string; low: string }>;
  committed?: Array<{ topic: string; partitions: Array<{ partition: number; offset: string }> }>;
  messages?: Msg[];
  runError?: Error;
}) {
  const sent: Array<{ topic: string; headers: unknown }> = [];
  const admin = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    listTopics: jest.fn().mockResolvedValue(opts.topics ?? [`${T}.dlq`]),
    fetchTopicOffsets: jest.fn().mockResolvedValue(opts.ends ?? []),
    fetchOffsets: jest.fn().mockResolvedValue(opts.committed ?? []),
  };
  const producer = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    send: jest.fn(
      async ({ topic, messages }: { topic: string; messages: Array<{ headers: unknown }> }) => {
        sent.push({ topic, headers: messages[0]!.headers });
      },
    ),
  };
  const consumer = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    subscribe: jest.fn(),
    run: jest.fn(async ({ eachMessage }: { eachMessage: (p: unknown) => Promise<void> }) => {
      if (opts.runError) throw opts.runError;
      for (const m of opts.messages ?? []) {
        await eachMessage({
          partition: m.partition,
          message: { offset: m.offset, value: Buffer.from('v'), headers: m.headers },
        });
      }
    }),
  };
  const kafka = { admin: () => admin, producer: () => producer, consumer: () => consumer };
  return { kafka: kafka as unknown as Kafka, sent, admin, consumer, producer };
}

describe('replayTenantDlq', () => {
  const opts = (kafka: Kafka) => ({ ...BASE, groupId: 'g', kafka });

  it('does nothing for a tenant with no DLQ topic', async () => {
    const f = fakeKafka({ topics: ['other.dlq'] });
    await expect(replayTenantDlq(opts(f.kafka))).resolves.toEqual({ replayed: 0, skipped: 0 });
    expect(f.admin.disconnect).toHaveBeenCalled();
    expect(f.consumer.connect).not.toHaveBeenCalled();
  });

  it('does nothing when the group has already read to the end', async () => {
    const f = fakeKafka({
      ends: [{ partition: 0, high: '3', low: '0' }],
      committed: [{ topic: `${T}.dlq`, partitions: [{ partition: 0, offset: '3' }] }],
    });
    await expect(replayTenantDlq(opts(f.kafka))).resolves.toEqual({ replayed: 0, skipped: 0 });
    expect(f.consumer.connect).not.toHaveBeenCalled();
  });

  it('republishes matching entries up to the end it saw, with the tenant_id header, and skips the rest', async () => {
    const f = fakeKafka({
      ends: [
        { partition: 0, high: '3', low: '0' },
        { partition: 1, high: '1', low: '0' },
        { partition: 2, high: '0', low: '0' }, // empty
      ],
      // partition 1: group committed nothing for it; partition 0 read from the start (-1).
      committed: [{ topic: `${T}.dlq`, partitions: [{ partition: 0, offset: '-1' }] }],
      messages: [
        { partition: 0, offset: '0', headers: GOOD },
        { partition: 9, offset: '0', headers: GOOD }, // not a partition it is reading
        {
          partition: 0,
          offset: '1',
          headers: h(`${T}.x.v1`, 'AVRO_DECODE_ERROR', '2026-11-13T10:05:00Z'),
        },
        { partition: 1, offset: '0', headers: GOOD },
        { partition: 0, offset: '2', headers: GOOD },
        { partition: 0, offset: '3', headers: GOOD }, // past the end it saw
      ],
    });
    await expect(replayTenantDlq(opts(f.kafka))).resolves.toEqual({ replayed: 3, skipped: 1 });
    expect(f.sent).toHaveLength(3);
    expect(f.sent[0]).toEqual({ topic: `${T}.finance.po.created.v1`, headers: { tenant_id: T } });
    expect(f.consumer.disconnect).toHaveBeenCalled();
    expect(f.producer.disconnect).toHaveBeenCalled();
  });

  it('resumes from the offset the group committed', async () => {
    const f = fakeKafka({
      ends: [{ partition: 0, high: '2', low: '0' }],
      committed: [{ topic: `${T}.dlq`, partitions: [{ partition: 0, offset: '1' }] }],
      messages: [{ partition: 0, offset: '1', headers: GOOD }],
    });
    await expect(replayTenantDlq(opts(f.kafka))).resolves.toEqual({ replayed: 1, skipped: 0 });
  });

  it('fails when the consumer fails, and still disconnects', async () => {
    const f = fakeKafka({
      ends: [{ partition: 0, high: '1', low: '0' }],
      runError: new Error('broker gone'),
    });
    await expect(replayTenantDlq(opts(f.kafka))).rejects.toThrow('broker gone');
    expect(f.consumer.disconnect).toHaveBeenCalled();
    expect(f.producer.disconnect).toHaveBeenCalled();
  });

  it.each([
    [{}, { clientId: 'cos-backend-dlq-replay', brokers: ['localhost:29092'] }],
    [
      { KAFKA_CLIENT_ID: 'w', KAFKA_BROKERS: 'a:1,b:2' },
      { clientId: 'w-dlq-replay', brokers: ['a:1', 'b:2'] },
    ],
  ])(
    'builds its own client from the environment when none is given (%j)',
    async (env, expected) => {
      const saved = { ...process.env };
      delete process.env['KAFKA_CLIENT_ID'];
      delete process.env['KAFKA_BROKERS'];
      Object.assign(process.env, env);
      const f = fakeKafka({ topics: [] });
      KafkaCtor.mockReturnValue(f.kafka);
      try {
        await replayTenantDlq({ ...BASE, groupId: 'g' });
        expect(KafkaCtor).toHaveBeenLastCalledWith(expected);
      } finally {
        process.env = saved;
      }
    },
  );
});
