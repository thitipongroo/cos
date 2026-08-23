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
// Per-tenant topic model + provisioning (spec §7.3, §15.6/15.7, §32.4)
export { KafkaTopicProvisioner, tenantTopicSuffixes } from './kafka/topic-provisioner';
export type { ProvisionerOptions } from './kafka/topic-provisioner';
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
} from './kafka/topic-catalog';
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
export type * from './events/construction.project.risk_raised.v1';
export type * from './events/construction.project.risk_status_changed.v1';
export type * from './events/construction.boq.version_created.v1';
export type * from './events/construction.boq.version_approved.v1';
export type * from './events/construction.boq.created.v1';
export type * from './events/construction.boq.updated.v1';
export type * from './events/procurement.purchase_order.created.v1';
export type * from './events/procurement.vendor_invoice.received.v1';
export type * from './events/site.report.created.v1';
export type * from './events/site.report.submitted.v1';
export type * from './events/site.inspection.failed.v1';
export type * from './events/site.inspection.passed.v1';
export type * from './events/site.issue.created.v1';
export type * from './events/site.issue.status_changed.v1';
export type * from './events/site.conflict.flagged.v1';
export type * from './events/construction.task.completed.v1';
export type * from './events/construction.delay.detected.v1';
export type * from './events/workforce.checkin.created.v1';
export type * from './events/site.material.consumed.v1';
export type * from './events/procurement.delivery.received.v1';
export type * from './events/procurement.rfq.created.v1';
export type * from './events/procurement.rfq.status_changed.v1';
export type * from './events/procurement.purchase_order.status_changed.v1';
export type * from './events/procurement.po.approval_requested.v1';
export type * from './events/finance.budget.created.v1';
export type * from './events/finance.payment.processed.v1';
export type * from './events/finance.variance.alert.v1';
export type * from './events/finance.budget.exceeded.v1';
export type * from './events/finance.billing.approved.v1';
export type * from './events/finance.ar_receipt.recorded.v1';
export type * from './events/procurement.vendor_invoice.approved.v1';
export type * from './events/finance.cashflow_risk.detected.v1';
export type * from './events/ai.risk_prediction.generated.v1';

// Phase 2 identity events (canonical names — spec §Phase 2 Kafka events)
export type * from './events/identity.tenant.created.v1';
export type * from './events/identity.tenant.deactivated.v1';
export type * from './events/identity.user.created.v1';
export type * from './events/identity.user.role_changed.v1';
export type * from './events/platform.enterprise.contract_signed.v1';
export type * from './events/platform.enterprise.db_provisioned.v1';

// Phase 9 file events (canonical names — spec §Phase 9 Kafka events)
export type * from './events/file.document.uploaded.v1';
export type * from './events/file.document.quarantined.v1';

// Phase 21 equipment events (canonical names — spec §Phase 21 Kafka events)
export type * from './events/equipment.unit.assigned.v1';
export type * from './events/equipment.unit.returned.v1';
export type * from './events/equipment.unit.maintenance_scheduled.v1';

// Phase 22 workforce events (canonical names — spec §Phase 22 Kafka events)
export type * from './events/workforce.checkout.created.v1';
export type * from './events/workforce.timesheet.approved.v1';

// Phase 24 digital twin events (canonical names — spec §Phase 24 Kafka events)
export type * from './events/twin.state.updated.v1';
export type * from './events/twin.divergence.detected.v1';

// Phase 24 carbon analytics events (canonical names — spec §33.3 CarbonCalculationEngine EP)
export type * from './events/carbon.record.created.v1';
export type * from './events/construction.boq.items_published.v1';
export type * from './events/finance.contract.document_attached.v1';
export type * from './events/finance.contract.signature_recorded.v1';
export type * from './events/finance.contract.signed.v1';
export type * from './events/identity.user.password_reset.v1';
export type * from './events/safety.incident.created.v1';
export type * from './events/site.issue.escalated.v1';
export type * from './events/platform.sync.exhausted.v1';
