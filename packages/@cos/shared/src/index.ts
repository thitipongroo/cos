// @cos/shared — Typed Kafka event interfaces + Avro schemas + Kafka SDK
// All cross-service event contracts are defined here.
// Source: context/00_master_construction_os.md §6 CROSS-SERVICE EVENT CONTRACT SPEC

export type { BaseEventEnvelope } from '@cos/types';

// Phase 8 — Kafka SDK (KafkaProducer, KafkaConsumer, OutboxPublisher, DlqPublisher)
export { KafkaProducer } from './kafka/producer';
export { KafkaConsumer } from './kafka/consumer';
export type { MessageHandler, ConsumerOptions } from './kafka/consumer';
export { OutboxPublisher, OutboxPoller } from './kafka/outbox';
export { DlqPublisher } from './kafka/dlq';
export {
  initKafkaMetrics,
  recordProduced,
  recordConsumed,
  recordProducerError,
  setConsumerLag,
  setDlqDepth,
} from './kafka/metrics';
export {
  getSchemaRegistry,
  registerSchema,
  encodeAvro,
  decodeAvro,
} from './kafka/schema-registry.client';

// Event payload types (canonical names — spec §32.4)
export type * from './events/construction.project.created.v1';
export type * from './events/construction.project.updated.v1';
export type * from './events/construction.project.status_changed.v1';
export type * from './events/construction.project.archived.v1';
export type * from './events/construction.boq.version_created.v1';
export type * from './events/procurement.purchase_order.created.v1';
export type * from './events/procurement.vendor_invoice.received.v1';
export type * from './events/site.report.created.v1';
export type * from './events/site.report.submitted.v1';
export type * from './events/site.inspection.failed.v1';
export type * from './events/site.inspection.passed.v1';
export type * from './events/site.issue.created.v1';
export type * from './events/site.issue.status_changed.v1';
export type * from './events/construction.task.completed.v1';
export type * from './events/construction.delay.detected.v1';
export type * from './events/workforce.checkin.created.v1';
export type * from './events/site.material.consumed.v1';
export type * from './events/procurement.delivery.received.v1';
export type * from './events/procurement.rfq.created.v1';
export type * from './events/procurement.rfq.status_changed.v1';
export type * from './events/procurement.purchase_order.status_changed.v1';
export type * from './events/finance.budget.exceeded.v1';
export type * from './events/procurement.vendor_invoice.approved.v1';
export type * from './events/finance.cashflow_risk.detected.v1';
export type * from './events/ai.risk_prediction.generated.v1';

// Phase 2 identity events (canonical names — spec §Phase 2 Kafka events)
export type * from './events/identity.tenant.created.v1';
export type * from './events/identity.tenant.deactivated.v1';
export type * from './events/identity.user.created.v1';
export type * from './events/identity.user.role_changed.v1';

// Phase 9 file events (canonical names — spec §Phase 9 Kafka events)
export type * from './events/file.document.uploaded.v1';
export type * from './events/file.document.quarantined.v1';
