// Kafka topic provisioning — spec §7.3 (per-tenant topic isolation) + §15.7 (platform events).
//
// Topics are created explicitly (producers run with allowAutoTopicCreation: false). The full
// canonical event catalogue is materialised per tenant as `{tenant_id}.{event_type}` topics,
// plus one `{tenant_id}.{domain}.dlq` per domain. Platform events share a single
// `platform.events` topic (and `platform.dlq`). createTopics is idempotent — topics that
// already exist are skipped, so provisioning can run on every tenant onboarding safely.

import { Kafka, Admin, logLevel } from 'kafkajs';
import { createLogger } from '@cos/logger';
import {
  CANONICAL_EVENT_TYPES,
  isPlatformEvent,
  domainOf,
  PLATFORM_EVENTS_TOPIC,
  PLATFORM_DLQ_TOPIC,
} from './topic-catalog';

const logger = createLogger('kafka-topic-provisioner');

const DEFAULT_PARTITIONS = parseInt(process.env['KAFKA_TOPIC_PARTITIONS'] ?? '3', 10);
const DEFAULT_REPLICATION_FACTOR = parseInt(
  process.env['KAFKA_TOPIC_REPLICATION_FACTOR'] ?? '1',
  10,
);

/** Canonical event types that are per-tenant (everything except platform.* events). */
const TENANT_EVENT_TYPES: readonly string[] = CANONICAL_EVENT_TYPES.filter(
  (et) => !isPlatformEvent(et),
);

/** Distinct domains across tenant event types — one DLQ topic each (§7.3). */
const TENANT_DOMAINS: readonly string[] = [...new Set(TENANT_EVENT_TYPES.map(domainOf))];

/** The full per-tenant topic set (domain event topics + per-domain DLQ topics), un-prefixed. */
export function tenantTopicSuffixes(): string[] {
  return [...TENANT_EVENT_TYPES, ...TENANT_DOMAINS.map((d) => `${d}.dlq`)];
}

export interface ProvisionerOptions {
  numPartitions?: number;
  replicationFactor?: number;
}

/**
 * Creates the per-tenant Kafka topic set (idempotently) and the shared platform topics.
 * Invoked from tenant onboarding (SMB Phase 2 + Enterprise Phase 25) and the dev seed.
 */
export class KafkaTopicProvisioner {
  private readonly kafka: Kafka;
  private admin: Admin | null = null;
  private readonly numPartitions: number;
  private readonly replicationFactor: number;

  constructor(opts: ProvisionerOptions = {}) {
    this.kafka = new Kafka({
      clientId: `${process.env['KAFKA_CLIENT_ID'] ?? 'cos-backend'}-provisioner`,
      brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:29092').split(','),
      logLevel: process.env['NODE_ENV'] === 'test' ? logLevel.NOTHING : logLevel.WARN,
    });
    this.numPartitions = opts.numPartitions ?? DEFAULT_PARTITIONS;
    this.replicationFactor = opts.replicationFactor ?? DEFAULT_REPLICATION_FACTOR;
  }

  async connect(): Promise<void> {
    if (this.admin) return;
    this.admin = this.kafka.admin();
    await this.admin.connect();
  }

  async disconnect(): Promise<void> {
    await this.admin?.disconnect();
    this.admin = null;
  }

  /** Create every per-tenant topic for `tenantId`. Idempotent — existing topics are skipped. */
  async provisionTenant(tenantId: string): Promise<void> {
    if (!tenantId) throw new Error('provisionTenant requires a tenantId');
    const topics = tenantTopicSuffixes().map((suffix) => `${tenantId}.${suffix}`);
    await this.createTopics(topics);
    logger.info({ tenantId, topicCount: topics.length }, 'Provisioned per-tenant Kafka topics');
  }

  /** Create the shared platform topics (platform.events + platform.dlq). Idempotent. */
  async ensurePlatformTopics(): Promise<void> {
    await this.createTopics([PLATFORM_EVENTS_TOPIC, PLATFORM_DLQ_TOPIC]);
    logger.info('Ensured shared platform Kafka topics');
  }

  private async createTopics(topicNames: string[]): Promise<void> {
    if (!this.admin) throw new Error('KafkaTopicProvisioner not connected — call connect() first');

    // List existing topics and create only the missing ones — keeps provisioning truly
    // idempotent and avoids the broker's noisy TOPIC_ALREADY_EXISTS errors on re-runs.
    const existing = new Set(await this.admin.listTopics());
    const toCreate = topicNames.filter((topic) => !existing.has(topic));
    if (toCreate.length === 0) {
      logger.debug({ requested: topicNames.length }, 'All requested Kafka topics already exist');
      return;
    }

    // waitForLeaders: false — provisioning runs ahead of any traffic, so we don't block
    // on leader election; doing so triggers a metadata refresh that can transiently throw
    // UNKNOWN_TOPIC_OR_PARTITION while leaders are still being assigned for just-created topics.
    await this.admin.createTopics({
      topics: toCreate.map((topic) => ({
        topic,
        numPartitions: this.numPartitions,
        replicationFactor: this.replicationFactor,
      })),
      waitForLeaders: false,
    });
    logger.debug(
      { requested: topicNames.length, created: toCreate.length },
      'Created new Kafka topics',
    );
  }
}
