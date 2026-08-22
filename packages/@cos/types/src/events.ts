// Base event envelope — all Kafka events must conform to this structure
// Source: context/00_master_construction_os.md §6 CROSS-SERVICE EVENT CONTRACT SPEC

export interface BaseEventEnvelope<TPayload = unknown> {
  event_id: string; // UUID v4
  event_type: string; // canonical: {domain}.{entity}.{action}.v{N}
  event_version: string; // semver patch, e.g. "1.0"
  tenant_id: string; // UUID
  actor_id: string; // UUID — user who triggered
  occurred_at: string; // ISO 8601 UTC
  correlation_id: string; // UUID — for distributed tracing
  /**
   * W3C trace context, captured where the event was RAISED (TDD OQ-2).
   *
   * Optional on the type because a publisher outside a traced request has none, and because every
   * existing caller builds the envelope without them. Both are declared in every event's Avro schema
   * as `["null","string"]` with a `null` default, so an envelope that omits them still encodes.
   *
   * They exist because the outbox makes delivery ASYNCHRONOUS: `OutboxPollerService` publishes
   * minutes later, in another process, under its own span — so injecting the active context at send
   * time would stamp the poller's trace onto the event, not the request's. Carrying it in the
   * envelope is the only way the originating trace survives the hop, and the poller copies it back
   * into the Kafka headers QM-8 requires.
   */
  trace_id?: string | null; // OTel trace_id (32 hex chars)
  span_id?: string | null; // OTel span_id (16 hex chars) — the span that raised the event
  payload: TPayload;
}
