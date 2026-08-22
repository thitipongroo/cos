// Kafka topic + Schema Registry subject derivation — authoritative source for the
// per-tenant topic model. Specs: §7.3 (Kafka Topic Isolation), §15.6/§15.7
// (event naming + platform events), §32.4 (event contracts + schema registry).
//
// Naming model:
//   - CloudEvents `type` / event_type : {domain}.{entity}.{action}.{version}      (no tenant prefix)
//   - Kafka topic name (per-tenant)    : {tenant_id}.{domain}.{entity}.{action}.{version}
//   - Platform events ({platform.*})   : shared `platform.events` topic, NOT tenant-scoped (§15.7)
//   - DLQ topic                        : {tenant_id}.dlq  (ONE per tenant, not per domain, §7.3)
//   - Schema Registry subject          : canonical event_type (RecordNameStrategy) — one schema
//                                        per event, shared across all tenants (§32.4 resolution).

/** Shared topic for platform-level events (Phase 25) — §15.7. */
export const PLATFORM_EVENTS_TOPIC = 'platform.events';
/** Shared DLQ for platform-level events. */
export const PLATFORM_DLQ_TOPIC = 'platform.dlq';

/**
 * Canonical event catalogue (§32.4): event_type → Avro schema file.
 * Single source of truth for both the producer (schema lookup) and the topic
 * provisioner (per-tenant topic set).
 */
export const EVENT_AVSC_MAP: Record<string, string> = {
  // Construction
  'construction.project.created.v1': 'construction.project.created.v1.avsc',
  'construction.project.updated.v1': 'construction.project.updated.v1.avsc',
  'construction.project.status_changed.v1': 'construction.project.status_changed.v1.avsc',
  'construction.project.archived.v1': 'construction.project.archived.v1.avsc',
  'construction.project.risk_raised.v1': 'construction.project.risk_raised.v1.avsc',
  'construction.project.risk_status_changed.v1': 'construction.project.risk_status_changed.v1.avsc',
  'construction.boq.version_created.v1': 'construction.boq.version_created.v1.avsc',
  'construction.boq.version_approved.v1': 'construction.boq.version_approved.v1.avsc',
  'construction.boq.created.v1': 'construction.boq.created.v1.avsc',
  'construction.boq.updated.v1': 'construction.boq.updated.v1.avsc',
  'construction.boq.items_published.v1': 'construction.boq.items_published.v1.avsc',
  'construction.task.completed.v1': 'construction.task.completed.v1.avsc',
  'construction.delay.detected.v1': 'construction.delay.detected.v1.avsc',
  // Procurement
  'procurement.po.created.v1': 'procurement.po.created.v1.avsc',
  'procurement.po.status_changed.v1': 'procurement.po.status_changed.v1.avsc',
  'procurement.po.approval_requested.v1': 'procurement.po.approval_requested.v1.avsc',
  'procurement.invoice.received.v1': 'procurement.invoice.received.v1.avsc',
  'procurement.rfq.created.v1': 'procurement.rfq.created.v1.avsc',
  'procurement.rfq.status_changed.v1': 'procurement.rfq.status_changed.v1.avsc',
  'procurement.vendor_invoice.approved.v1': 'procurement.vendor_invoice.approved.v1.avsc',
  'procurement.delivery.received.v1': 'procurement.delivery.received.v1.avsc',
  // Site Ops
  'site.report.created.v1': 'site.report.created.v1.avsc',
  'site.report.submitted.v1': 'site.report.submitted.v1.avsc',
  'site.inspection.failed.v1': 'site.inspection.failed.v1.avsc',
  'site.inspection.passed.v1': 'site.inspection.passed.v1.avsc',
  'site.issue.created.v1': 'site.issue.created.v1.avsc',
  'site.issue.escalated.v1': 'site.issue.escalated.v1.avsc',
  'site.issue.status_changed.v1': 'site.issue.status_changed.v1.avsc',
  'site.material.consumed.v1': 'site.material.consumed.v1.avsc',
  'site.conflict.flagged.v1': 'site.conflict.flagged.v1.avsc',
  // Safety (Phase 6) — consumed by Notification Service for §19.3 escalation
  'safety.incident.created.v1': 'safety.incident.created.v1.avsc',
  // Finance
  'finance.budget.created.v1': 'finance.budget.created.v1.avsc',
  'finance.budget.exceeded.v1': 'finance.budget.exceeded.v1.avsc',
  'finance.payment.processed.v1': 'finance.payment.processed.v1.avsc',
  'finance.variance.alert.v1': 'finance.variance.alert.v1.avsc',
  'finance.cashflow_risk.detected.v1': 'finance.cashflow_risk.detected.v1.avsc',
  'finance.billing.approved.v1': 'finance.billing.approved.v1.avsc',
  'finance.ar_receipt.recorded.v1': 'finance.ar_receipt.recorded.v1.avsc',
  'finance.contract.document_attached.v1': 'finance.contract.document_attached.v1.avsc',
  'finance.contract.signature_recorded.v1': 'finance.contract.signature_recorded.v1.avsc',
  'finance.contract.signed.v1': 'finance.contract.signed.v1.avsc',
  // Workforce (Phase 22)
  'workforce.checkin.created.v1': 'workforce.checkin.created.v1.avsc',
  'workforce.checkout.created.v1': 'workforce.checkout.created.v1.avsc',
  'workforce.timesheet.approved.v1': 'workforce.timesheet.approved.v1.avsc',
  // Equipment (Phase 21)
  'equipment.unit.assigned.v1': 'equipment.unit.assigned.v1.avsc',
  'equipment.unit.returned.v1': 'equipment.unit.returned.v1.avsc',
  'equipment.unit.maintenance_scheduled.v1': 'equipment.unit.maintenance_scheduled.v1.avsc',
  // Identity
  'identity.tenant.created.v1': 'identity.tenant.created.v1.avsc',
  'identity.tenant.deactivated.v1': 'identity.tenant.deactivated.v1.avsc',
  'identity.user.created.v1': 'identity.user.created.v1.avsc',
  'identity.user.role_changed.v1': 'identity.user.role_changed.v1.avsc',
  'identity.user.password_reset.v1': 'identity.user.password_reset.v1.avsc',
  // Platform
  'platform.enterprise.contract_signed.v1': 'platform.enterprise.contract_signed.v1.avsc',
  'platform.enterprise.db_provisioned.v1': 'platform.enterprise.db_provisioned.v1.avsc',
  // AI
  'ai.risk_prediction.generated.v1': 'ai.risk_prediction.generated.v1.avsc',
  // Digital Twin (Phase 24)
  'twin.state.updated.v1': 'twin.state.updated.v1.avsc',
  'twin.divergence.detected.v1': 'twin.divergence.detected.v1.avsc',
  // Carbon Analytics (Phase 24 / CarbonCalculationEngine EP Phase 6)
  'carbon.record.created.v1': 'carbon.record.created.v1.avsc',
  // File Service
  'file.document.uploaded.v1': 'file.document.uploaded.v1.avsc',
  'file.document.quarantined.v1': 'file.document.quarantined.v1.avsc',
};

/** All canonical event types (CloudEvents `type`) in the catalogue. */
export const CANONICAL_EVENT_TYPES: readonly string[] = Object.keys(EVENT_AVSC_MAP);

/** Platform-level events are emitted to the shared `platform.events` topic, not per-tenant. */
export function isPlatformEvent(eventType: string): boolean {
  return eventType.startsWith('platform.');
}

/** First segment of an event type or topic — the bounded-context domain. */
export function domainOf(eventTypeOrTopic: string): string {
  // String.split() always returns at least one element ('' for an empty input), so [0] is
  // always a string — no nullish fallback needed (an unreachable `?? ''` is an uncovered branch).
  return eventTypeOrTopic.split('.')[0];
}

/**
 * Kafka topic a published event is routed to (§7.3, §15.6).
 * Platform events use the shared topic; all other events are per-tenant.
 */
export function topicForEvent(eventType: string, tenantId: string): string {
  return isPlatformEvent(eventType) ? PLATFORM_EVENTS_TOPIC : `${tenantId}.${eventType}`;
}

/**
 * Schema Registry subject (§32.4 — RecordNameStrategy): the canonical event type,
 * shared across tenants so there is exactly one schema per event regardless of tenant.
 */
export function subjectForEvent(eventType: string): string {
  return eventType;
}

/**
 * RegExp matching a canonical event's per-tenant topics across every tenant
 * (`{tenant_id}.{event_type}`). Shared-cluster consumers (§7.3) subscribe with this
 * pattern under a single `{service}.shared` group and validate the tenant_id header.
 * tenant_id is a UUID (no dots), so `[^.]+` matches exactly the tenant prefix segment.
 */
/**
 * A pattern matching exactly one topic name.
 *
 * Used for the shared platform topic. Subscribing to it by LITERAL name throws when the topic does
 * not exist yet — the same hazard tenantTopicPattern below exists to avoid — and nothing creates
 * `platform.events` ahead of the first publish (master:3093-3100 gives that job to the producer).
 * A RegExp subscription simply matches nothing until the topic appears, and KafkaJS picks it up
 * once it does.
 */
/**
 * Entity state topics — the topics master:3104 says are log-compacted.
 *
 * WHAT MAKES A TOPIC ONE. Its events describe the current state of a single durable entity, named
 * by a stable id in the payload, such that keeping ONLY the latest message per entity still leaves a
 * correct picture. That is exactly the trade log compaction makes, so it is the only shape of topic
 * that can survive it.
 *
 * Records of occurrences are the opposite and must never appear here: a delivery received, a safety
 * incident, a daily report, a check-in. Each is a separate fact, and compaction would delete all but
 * the most recent one for the key.
 *
 * THE VALUE IS THE PAYLOAD FIELD HOLDING THE ENTITY ID, and it is what the producer keys the message
 * by. The two halves cannot be separated: every other topic is keyed by `tenant_id`, and compacting
 * a tenant-keyed topic would reduce it to ONE SURVIVING EVENT PER TENANT — the whole history gone.
 * Keeping the key and the cleanup policy in this single map is what makes that impossible to do by
 * halves.
 *
 * THE LIST IS DELIBERATELY SHORT. master:3104 names the project family ("project.project.*", mapped
 * to the canonical `construction.project.*` by master:725) and then says "etc.", which names
 * nothing. Adding a topic here is a decision about data retention, so it is made explicitly, one
 * entry at a time, rather than inferred from a naming pattern.
 *
 * `construction.project.risk_raised.v1` and `.risk_status_changed.v1` are NOT here on purpose: they
 * carry `project_id` but they are events about a RISK, and keying them by project would collapse
 * every risk on a project into whichever was raised last.
 */
export const ENTITY_STATE_TOPICS: Readonly<Record<string, string>> = Object.freeze({
  'construction.project.created.v1': 'project_id',
  'construction.project.updated.v1': 'project_id',
  'construction.project.status_changed.v1': 'project_id',
  'construction.project.archived.v1': 'project_id',
});

/** The payload field to key by, or undefined for an ordinary (tenant-keyed, non-compacted) topic. */
export function entityStateKeyField(eventType: string): string | undefined {
  return ENTITY_STATE_TOPICS[eventType];
}

export function exactTopicPattern(topic: string): RegExp {
  // Same escaping as below, for the same reason.
  return new RegExp(`^${topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

export function tenantTopicPattern(eventType: string): RegExp {
  // Escape every regex metacharacter, not just the dot. The previous version replaced `.` alone, so
  // any other metacharacter in eventType survived into `new RegExp` and changed what the
  // subscription matched — `*`, `+` and `{n,m}` are the dangerous ones, because a shared-cluster
  // consumer subscribing by pattern would silently widen or narrow its topic set. Every caller
  // today passes a catalog constant, so this is hardening rather than a live bug; but the signature
  // takes a plain string and nothing enforces that.
  // Found by CodeQL js/incomplete-sanitization.
  const escaped = eventType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^[^.]+\\.${escaped}$`);
}

/**
 * DLQ topic for a failed message's original topic — `{tenant_id}.dlq` (§7.3).
 *
 * One DLQ per tenant, not one per tenant-and-domain. The §7.3 guarantee is about tenants —
 * "DLQ for tenant A cannot receive messages from tenant B" — and a single tenant-scoped DLQ
 * satisfies it exactly, while a DLQ per domain multiplied the per-tenant topic count by ten for a
 * separation the spec never asked for. The failed message keeps its `dlq.original_topic` header,
 * so the domain it came from is still recoverable when triaging.
 */
export function dlqTopicFor(originalTopic: string): string {
  if (originalTopic === PLATFORM_EVENTS_TOPIC || isPlatformEvent(originalTopic)) {
    return PLATFORM_DLQ_TOPIC;
  }
  const [tenantId] = originalTopic.split('.');
  return `${tenantId}.dlq`;
}
