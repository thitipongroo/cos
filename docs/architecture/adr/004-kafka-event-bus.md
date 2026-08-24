---
title: 'ADR-004 — Apache Kafka as Internal Event Bus'
status: Accepted
last_updated: '2026-05-29'
authors:
  - thitipongroo
---

# ADR-004 — Apache Kafka as Internal Event Bus

**Status:** Accepted
**Date:** 2026-01-20
**Deciders:** Engineering team

## Context

Construction OS has async cross-module coordination requirements:

- Procurement events → Finance (invoice processing)
- Site reports → Analytics (aggregation)
- All operational data → Knowledge Graph ingestion
- Delay detection → Notification Service

Options considered:

1. Direct NestJS EventEmitter (in-process, no persistence)
2. PostgreSQL LISTEN/NOTIFY
3. Redis Streams
4. **Apache Kafka** (distributed, persistent, replay-capable)
5. RabbitMQ

## Decision

**Apache Kafka 3.6.x** with **Confluent Schema Registry** for Avro schema management.

## Rationale

- Persistent event log = replay capability for Knowledge Graph rebuild, analytics backfill
- Schema Registry enforces BACKWARD compatibility — prevents breaking consumers on producer changes
- Kafka is already part of the infrastructure moat: the event log IS the operational dataset
- Consumer groups allow multiple services to independently consume the same events
- MSK (AWS Managed Kafka) removes operational burden for production

## Consequences

- All cross-module events use the typed envelope from `packages/@cos/event-contracts/`
- Kafka is **not** a microservices boundary signal — modules remain inside the monolith
- Dead Letter Queues (DLQ) per topic for failed message handling
- Consumer idempotency required: `event_id` (UUID) deduplication in all consumers
- Event ordering guaranteed per `tenant_id` partition key

## Explicitly NOT done

- Direct HTTP calls between domain modules (enforced by ADR-001)
- Outbox pattern skipped for MVP — added in Phase 19 readiness check as [MANUAL] item

---

## Alternatives Considered

| Option                           | Reason Rejected                                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| NestJS EventEmitter (in-process) | No persistence — event replay for Knowledge Graph rebuild and analytics backfill impossible; lost on pod restart |
| PostgreSQL LISTEN/NOTIFY         | Not distributed; cannot fan-out to multiple independent consumers; no schema registry for BACKWARD compatibility |
| Redis Streams                    | Weaker durability guarantees; no Confluent Schema Registry integration; no native MSK managed offering           |
| RabbitMQ                         | Message log is ephemeral by default; no offset-based replay; no native schema enforcement                        |

---

## References

- `docs/00-specifications/15-event-driven-workflow.md` §15.6 — topic naming convention and CloudEvents v1.0 envelope
- `docs/00-specifications/32-implementation-specifications.md` §32.4 — event contracts,
  schema registry rules, and Avro schema catalogue
