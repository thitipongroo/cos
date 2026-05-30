// @cos/shared — Typed Kafka event interfaces + Avro schemas
// All cross-service event contracts are defined here.
// Source: context/00_master_construction_os.md §6 CROSS-SERVICE EVENT CONTRACT SPEC
// Phase 8 adds the KafkaProducer, KafkaConsumer, OutboxPublisher implementations.

export type { BaseEventEnvelope } from '@cos/types';

// Phase 8 deliverables (stub exports — implemented in Phase 8):
// export { KafkaProducer } from './kafka/producer';
// export { KafkaConsumer } from './kafka/consumer';
// export { OutboxPublisher } from './kafka/outbox';

// Event payload types (canonical names — spec §32.4)
export type * from './events/construction.project.created.v1';
export type * from './events/construction.boq.version_created.v1';
export type * from './events/procurement.purchase_order.created.v1';
export type * from './events/procurement.vendor_invoice.received.v1';
export type * from './events/site.report.created.v1';
export type * from './events/site.inspection.failed.v1';
export type * from './events/construction.task.completed.v1';
export type * from './events/construction.delay.detected.v1';
export type * from './events/workforce.checkin.created.v1';
export type * from './events/site.material.consumed.v1';
export type * from './events/procurement.delivery.received.v1';
export type * from './events/finance.budget.exceeded.v1';
export type * from './events/procurement.vendor_invoice.approved.v1';
export type * from './events/finance.cashflow_risk.detected.v1';
export type * from './events/ai.risk_prediction.generated.v1';
