// Replay a tenant's DLQ entries back onto their original topics (D53, 2026-11-13).
//
// Enterprise provisioning pauses a tenant while it copies its data (D48, D51). Events for the tenant
// that arrive during the pause are refused by every consumer (TenantInactiveError, D50), retried three
// times within seconds, and land in the tenant's DLQ (`{tenant_id}.dlq`, dlq.ts). Nothing put them back.
// After the resume the provisioning workflow calls this for the pause's window.
//
// What it does:
//   - reads `{tenant_id}.dlq` from the start up to the end offsets it saw when it began — entries that
//     arrive while it runs are not its business;
//   - republishes an entry only if its `dlq.reason` contains `reasonIncludes`, its `dlq.failed_at` is at
//     or after `since`, and its `dlq.original_topic` belongs to the same tenant (`{tenant_id}.…`) — the
//     DLQ is per tenant, so anything else is malformed and is left alone;
//   - restores the `tenant_id` header, which the consumer requires to match the envelope and which the
//     DLQ entry does not carry (the original headers are not kept);
//   - commits each entry as it goes under `groupId`, so a retried call with the same group continues
//     where the last one stopped. An entry republished twice is still handled once per consumer group
//     within the consumer's 24 h idempotency window (consumer.ts).
//
// Entries are not removed from the DLQ (Kafka has no delete); a later replay with another group would
// see them again, and the same idempotency window is what keeps that harmless.

import { Kafka, type IHeaders } from 'kafkajs';
import { createLogger } from '@cos/logger';

const logger = createLogger('dlq-replay');

export interface DlqReplayOptions {
  tenantId: string;
  /** Only entries that failed at or after this moment. */
  since: Date;
  /** Only entries whose `dlq.reason` contains this text. */
  reasonIncludes: string;
  /** Consumer group for the read; reuse it to resume an interrupted replay. */
  groupId: string;
  /** For tests; defaults to KAFKA_BROKERS / KAFKA_CLIENT_ID. */
  kafka?: Kafka;
}

export interface DlqReplayResult {
  replayed: number;
  skipped: number;
}

function header(headers: IHeaders | undefined, name: string): string | undefined {
  const v = headers?.[name];
  return v === undefined ? undefined : String(v);
}

/** Where to republish one DLQ entry, or null to leave it. */
export function replayTarget(
  headers: IHeaders | undefined,
  opts: Pick<DlqReplayOptions, 'tenantId' | 'since' | 'reasonIncludes'>,
): string | null {
  const topic = header(headers, 'dlq.original_topic');
  const reason = header(headers, 'dlq.reason') ?? '';
  const failedAt = Date.parse(header(headers, 'dlq.failed_at') ?? '');
  if (!topic?.startsWith(`${opts.tenantId}.`)) return null;
  if (!reason.includes(opts.reasonIncludes)) return null;
  if (Number.isNaN(failedAt) || failedAt < opts.since.getTime()) return null;
  return topic;
}

export async function replayTenantDlq(opts: DlqReplayOptions): Promise<DlqReplayResult> {
  const kafka =
    opts.kafka ??
    new Kafka({
      clientId: `${process.env['KAFKA_CLIENT_ID'] ?? 'cos-backend'}-dlq-replay`,
      brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:29092').split(','),
    });
  const dlqTopic = `${opts.tenantId}.dlq`;
  const result: DlqReplayResult = { replayed: 0, skipped: 0 };

  // What is left to read: per partition, from the group's committed offset (or the start) to the end
  // offset now. A tenant that never had a failure has no DLQ topic at all.
  const admin = kafka.admin();
  await admin.connect();
  const pending = new Map<number, string>();
  try {
    if (!(await admin.listTopics()).includes(dlqTopic)) return result;
    const ends = await admin.fetchTopicOffsets(dlqTopic);
    const [committed] = await admin.fetchOffsets({ groupId: opts.groupId, topics: [dlqTopic] });
    for (const { partition, high, low } of ends) {
      const done = committed?.partitions.find((p) => p.partition === partition)?.offset ?? '-1';
      const from = BigInt(done) >= 0n ? BigInt(done) : BigInt(low);
      if (from < BigInt(high)) pending.set(partition, high);
    }
  } finally {
    await admin.disconnect();
  }
  if (pending.size === 0) return result;

  const producer = kafka.producer({ allowAutoTopicCreation: false });
  const consumer = kafka.consumer({ groupId: opts.groupId });
  await producer.connect();
  await consumer.connect();
  try {
    await consumer.subscribe({ topics: [dlqTopic], fromBeginning: true });
    await new Promise<void>((resolve, reject) => {
      consumer
        .run({
          autoCommitThreshold: 1,
          eachMessage: async ({ partition, message }) => {
            const end = pending.get(partition);
            if (end === undefined || BigInt(message.offset) >= BigInt(end)) return;
            const target = replayTarget(message.headers, opts);
            if (target === null) {
              result.skipped++;
            } else {
              await producer.send({
                topic: target,
                messages: [{ value: message.value, headers: { tenant_id: opts.tenantId } }],
              });
              result.replayed++;
            }
            if (BigInt(message.offset) + 1n >= BigInt(end)) pending.delete(partition);
            if (pending.size === 0) resolve();
          },
        })
        .catch(reject);
    });
  } finally {
    await consumer.disconnect();
    await producer.disconnect();
  }
  logger.info({ tenantId: opts.tenantId, ...result }, 'dlq.replay.complete');
  return result;
}
