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
  payload: TPayload;
}
