// Shared outbox envelope shape — Phase 8 Outbox Pattern.
//
// A domain service builds this envelope and hands it to the repository write it belongs with, so
// the business row and the outbox row are written in ONE transaction (§30.4 critical test:
// "DB write + event publish succeed atomically; no event emitted on DB rollback").
// The OutboxPoller then relays it to Kafka.
//
// Source: context/00_master_construction_os.md §Phase 8 (Outbox Pattern); QM-9; ADR-034.

import type { BaseEventEnvelope } from '@cos/types';

/** Envelope accepted by `OutboxPublisher.write` — `event_id` is generated when omitted. */
export type OutboxEventInput<T = unknown> = Omit<BaseEventEnvelope<T>, 'event_id'> & {
  event_id?: string;
};

/** Build a canonical envelope for the outbox. Pure — performs no I/O. */
export function buildOutboxEvent<T>(params: {
  eventType: string;
  tenantId: string;
  actorId: string;
  correlationId: string;
  payload: T;
  /** Semantic patch version within the major version (§32.4). Defaults to '1.0'. */
  eventVersion?: string;
  /** Injectable for deterministic tests; defaults to now. */
  occurredAt?: string;
}): OutboxEventInput<T> {
  return {
    event_type: params.eventType,
    event_version: params.eventVersion ?? '1.0',
    tenant_id: params.tenantId,
    actor_id: params.actorId,
    occurred_at: params.occurredAt ?? new Date().toISOString(),
    correlation_id: params.correlationId,
    payload: params.payload,
  };
}
