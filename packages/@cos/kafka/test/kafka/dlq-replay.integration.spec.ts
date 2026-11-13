// replayTenantDlq against a real broker (D53, 2026-11-13).
//
// The DLQ entries are written by DlqPublisher — the path KafkaConsumer takes after its retries — so the
// headers are the real ones. What has to hold:
//   - only the entries that failed for the given reason since the given moment are republished, onto
//     their original topic, with the tenant_id header the consumer requires restored and the value as-is;
//   - an entry written after the replay began is not read;
//   - running again with the same group republishes nothing (it resumes after its last commit).

process.env['TESTCONTAINERS_RYUK_DISABLED'] = 'true';

import { KafkaContainer, StartedKafkaContainer } from '@testcontainers/kafka';
import { Kafka } from 'kafkajs';
import { DlqPublisher } from '../../src/dlq';
import { replayTenantDlq } from '../../src/dlq-replay';

const TENANT = 'tenant-replay';
const TOPIC = `${TENANT}.procurement.po.created.v1`;
const SINCE = new Date('2026-11-13T10:00:00.000Z');

describe('replayTenantDlq — real broker', () => {
  let container: StartedKafkaContainer;
  let kafka: Kafka;
  let dlq: DlqPublisher;

  const entry = (value: string, reason: string, failedAt: string) =>
    dlq.publish({
      originalTopic: TOPIC,
      originalValue: Buffer.from(value),
      reason,
      failedAt,
      retryCount: 3,
    });

  async function readTopic(topic: string, expected: number) {
    const got: Array<{ value: string; tenant: string | undefined }> = [];
    const c = kafka.consumer({ groupId: `reader-${Date.now()}` });
    await c.connect();
    await c.subscribe({ topics: [topic], fromBeginning: true });
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 15_000);
      void c.run({
        eachMessage: async ({ message }) => {
          got.push({
            value: String(message.value),
            tenant: message.headers?.['tenant_id']?.toString(),
          });
          if (got.length === expected) {
            clearTimeout(timer);
            // Give a straggler a moment to show up if more than expected were sent.
            setTimeout(resolve, 2_000);
          }
        },
      });
    });
    await c.disconnect();
    return got;
  }

  beforeAll(async () => {
    container = await new KafkaContainer().start();
    const broker = `${container.getHost()}:${container.getMappedPort(9093)}`;
    process.env['KAFKA_BROKERS'] = broker;
    kafka = new Kafka({ clientId: 'dlq-replay-it', brokers: [broker] });
    const admin = kafka.admin();
    await admin.connect();
    await admin.createTopics({
      topics: [{ topic: TOPIC, numPartitions: 1, replicationFactor: 1 }],
    });
    await admin.disconnect();

    dlq = new DlqPublisher();
    await dlq.connect();
    await entry(
      'paused-1',
      'TenantInactiveError: tenant x is not active',
      '2026-11-13T10:01:00.000Z',
    );
    await entry(
      'before',
      'TenantInactiveError: tenant x is not active',
      '2026-11-13T09:00:00.000Z',
    );
    await entry('other', 'Error: relation does not exist', '2026-11-13T10:02:00.000Z');
    await entry(
      'paused-2',
      'TenantInactiveError: tenant x is not active',
      '2026-11-13T10:03:00.000Z',
    );
  }, 180_000);

  afterAll(async () => {
    await dlq?.disconnect();
    await container?.stop();
    delete process.env['KAFKA_BROKERS'];
  }, 60_000);

  it('republishes only the paused tenant’s inactive-failures since the pause, with tenant_id', async () => {
    const result = await replayTenantDlq({
      tenantId: TENANT,
      since: SINCE,
      reasonIncludes: 'TenantInactiveError',
      groupId: 'replay-run-1',
      kafka,
    });
    // An entry written after the replay began is not its business.
    await entry('late', 'TenantInactiveError: tenant x is not active', '2026-11-13T10:04:00.000Z');

    expect(result).toEqual({ replayed: 2, skipped: 2 });
    const got = await readTopic(TOPIC, 2);
    expect(got).toEqual([
      { value: 'paused-1', tenant: TENANT },
      { value: 'paused-2', tenant: TENANT },
    ]);
  }, 120_000);

  it('resumes after its last commit: the same group finds only what arrived since', async () => {
    const again = await replayTenantDlq({
      tenantId: TENANT,
      since: SINCE,
      reasonIncludes: 'TenantInactiveError',
      groupId: 'replay-run-1',
      kafka,
    });
    expect(again).toEqual({ replayed: 1, skipped: 0 }); // only 'late'
  }, 120_000);
});
