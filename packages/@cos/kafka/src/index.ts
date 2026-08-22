// @cos/kafka — Node-only Kafka SDK for Construction OS (Phase 8).
//
// Split out of @cos/shared on 2026-08-22 (ADR-055). @cos/shared is imported by React Native and
// the web Service Worker, so Rule 34 requires it to stay free of Node-only runtime code. Everything
// in this package depends on kafkajs / ioredis / prom-client / node:crypto / node:fs and is
// therefore server-only. Event payload *types* remain in @cos/shared.
//
// Source: context/00_master_construction_os.md §Phase 8; specs §32.4, §7.3, §15.6/§15.7.

// Producer / consumer
export { KafkaProducer } from './producer';
export { KafkaConsumer } from './consumer';
export type { MessageHandler, ConsumerOptions } from './consumer';

// Outbox pattern (transactional event publication)
export { OutboxPublisher, OutboxPoller } from './outbox';

// Dead letter queue
export { DlqPublisher } from './dlq';

// Per-tenant topic model + provisioning (§7.3, §15.6/15.7, §32.4)
export { KafkaTopicProvisioner, tenantTopicSuffixes } from './topic-provisioner';
export type { ProvisionerOptions } from './topic-provisioner';
export {
  EVENT_AVSC_MAP,
  CANONICAL_EVENT_TYPES,
  PLATFORM_EVENTS_TOPIC,
  PLATFORM_DLQ_TOPIC,
  isPlatformEvent,
  domainOf,
  topicForEvent,
  subjectForEvent,
  tenantTopicPattern,
  dlqTopicFor,
} from './topic-catalog';

// Prometheus metrics (QM-8)
export {
  initKafkaMetrics,
  recordProduced,
  recordConsumed,
  recordProducerError,
  setConsumerLag,
  setDlqDepth,
} from './metrics';

// Confluent Schema Registry (Avro, BACKWARD_TRANSITIVE — QM-9)
export {
  getSchemaRegistry,
  registerSchema,
  encodeAvro,
  decodeAvro,
} from './schema-registry.client';
