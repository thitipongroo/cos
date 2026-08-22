// Publishes kafka_consumer_lag and kafka_dlq_depth.
//
// WHY THIS FILE EXISTS
// --------------------
// `cos-alerts.yml` carries two alerts on these series, both severity `critical` and both paging:
//
//   KafkaDLQNonEmpty          kafka_dlq_depth > 0        for 5m
//   KafkaConsumerLagCritical  kafka_consumer_lag > 50000 for 0m
//
// `kafka.json` and `platform-overview.json` chart them. And **nothing emitted either series.**
// `registerConsumerLagGauge` / `registerDlqDepthGauge` existed in kafka-metrics.ts, and
// `setConsumerLag` / `setDlqDepth` existed in @cos/shared — every reference to all four was a test
// or a barrel export. A Prometheus alert on an absent series never fires: the rule evaluates to no
// data, which reads exactly like "nothing is wrong". So a poison message could fill a DLQ, or a
// consumer group fall a million messages behind, in silence — while the rule file and two dashboards
// said the opposite (TDD OQ-43).
//
// The Go side declines to define them on purpose and names the owner:
//   "kafka_consumer_lag — requires querying group offsets via the admin API, not something the
//    consume loop knows. The TypeScript side publishes it."
//   "kafka_dlq_depth — a producer only knows how many it wrote, which is a different number;
//    reporting one as the other would make the KafkaDLQNonEmpty alert lie."
// (libs/go/coskafka/metrics.go). This is that TypeScript side.
//
// Product-owner decision 2026-08-22: publish from the backend rather than deploy a kafka-exporter —
// the registration functions and their tests already existed, and the backend already holds a
// kafkajs admin client.

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, type Admin } from 'kafkajs';
import { createLogger } from '@cos/logger';
import { registerConsumerLagGauge, registerDlqDepthGauge } from './kafka-metrics';

const logger = createLogger('kafka-lag');

/**
 * Admin round trips are cached for this long. Prometheus scrapes every 15s and both gauges observe
 * on the same scrape, so without a cache one scrape costs two full offset sweeps. Shorter than the
 * scrape interval, so a value is never stale by more than one scrape.
 */
const CACHE_TTL_MS = 10_000;

/** A DLQ topic is `{original-topic}.dlq` — see @cos/shared/kafka/dlq.ts. */
const DLQ_SUFFIX = '.dlq';

type Cached<T> = { at: number; value: T };

@Injectable()
export class KafkaLagService implements OnModuleInit, OnModuleDestroy {
  private admin: Admin | null = null;
  private lagCache: Cached<Array<{ topic: string; group: string; lag: number }>> | null = null;
  private dlqCache: Cached<Array<{ topic: string; depth: number }>> | null = null;

  onModuleInit(): void {
    // Registration is synchronous and cheap — it only hands OpenTelemetry a callback. The admin
    // connection is opened lazily on the first scrape, so a broker that is slow to come up delays a
    // metric rather than blocking application startup.
    registerConsumerLagGauge(() => this.readConsumerLag());
    registerDlqDepthGauge(() => this.readDlqDepth());
    logger.info({}, 'kafka_lag.gauges.registered');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.admin) {
      await this.admin.disconnect().catch(() => undefined);
      this.admin = null;
    }
  }

  private async getAdmin(): Promise<Admin> {
    if (!this.admin) {
      const brokers = (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(',');
      const kafka = new Kafka({ clientId: 'cos-kafka-lag', brokers });
      this.admin = kafka.admin();
      await this.admin.connect();
    }
    return this.admin;
  }

  /**
   * Lag per (topic, consumer group), summed across partitions.
   *
   * Never throws. A gauge callback that rejects takes the whole scrape with it, which would lose
   * every other metric in the process — a monitoring fault becoming a monitoring outage. On failure
   * this reports nothing and logs, so the series goes absent and `up`/scrape-error surfaces it.
   */
  private async readConsumerLag(): Promise<Array<{ topic: string; group: string; lag: number }>> {
    if (this.lagCache && Date.now() - this.lagCache.at < CACHE_TTL_MS) return this.lagCache.value;

    const out: Array<{ topic: string; group: string; lag: number }> = [];
    try {
      const admin = await this.getAdmin();
      const { groups } = await admin.listGroups();

      for (const { groupId } of groups) {
        // fetchOffsets with no `topics` returns every topic the group has committed against, which
        // is what we want: the set is defined by what the group actually consumes, not by a list
        // here that would drift as consumers are added.
        const committed = await admin.fetchOffsets({ groupId });

        for (const { topic, partitions } of committed) {
          const high = await admin.fetchTopicOffsets(topic);
          const highByPartition = new Map(high.map((p) => [p.partition, Number(p.high)]));

          let lag = 0;
          for (const { partition, offset } of partitions) {
            // offset -1 means the group has never committed for this partition. Counting the whole
            // partition as lag would make a newly created group look catastrophically behind and
            // page on-call for nothing.
            const current = Number(offset);
            if (current < 0) continue;
            lag += Math.max(0, (highByPartition.get(partition) ?? current) - current);
          }
          out.push({ topic, group: groupId, lag });
        }
      }
      this.lagCache = { at: Date.now(), value: out };
    } catch (err) {
      logger.warn({ err }, 'kafka_lag.consumer_lag.failed');
      return this.lagCache?.value ?? [];
    }
    return out;
  }

  /**
   * Depth of each `*.dlq` topic: messages present and not yet removed by retention.
   *
   * `high - low`, not `high`. A DLQ topic whose oldest records have aged out still reports the
   * number sitting in it, which is what KafkaDLQNonEmpty asks about. Nothing consumes DLQ topics —
   * they are drained by an operator — so there is no committed offset to subtract.
   */
  private async readDlqDepth(): Promise<Array<{ topic: string; depth: number }>> {
    if (this.dlqCache && Date.now() - this.dlqCache.at < CACHE_TTL_MS) return this.dlqCache.value;

    const out: Array<{ topic: string; depth: number }> = [];
    try {
      const admin = await this.getAdmin();
      const topics = await admin.listTopics();

      for (const topic of topics.filter((t) => t.endsWith(DLQ_SUFFIX))) {
        const offsets = await admin.fetchTopicOffsets(topic);
        const depth = offsets.reduce((sum, p) => sum + (Number(p.high) - Number(p.low)), 0);
        out.push({ topic, depth });
      }
      this.dlqCache = { at: Date.now(), value: out };
    } catch (err) {
      logger.warn({ err }, 'kafka_lag.dlq_depth.failed');
      return this.dlqCache?.value ?? [];
    }
    return out;
  }
}
