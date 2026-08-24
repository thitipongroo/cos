---
title: Construction OS — Kafka Events
last_updated: 2026-08-07
---

# Kafka Events

Every module emits events through the shared SDK in `packages/@cos/shared` — `src/events/` (typed
interfaces), `src/avro/` (122 `.avsc` schemas), `src/kafka/` (producer, consumer, outbox). Nothing
publishes to Kafka directly.

## The envelope

Every event, without exception:

```ts
{
  event_id: string; // UUID v4
  event_type: string; // "{domain}.{entity}.{action}.v{N}"  e.g. construction.project.created.v1
  event_version: string; // semantic patch WITHIN the major, e.g. "1.0"
  tenant_id: string; // UUID
  actor_id: string; // UUID — the user who triggered it
  occurred_at: string; // ISO 8601 UTC
  correlation_id: string; // UUID — tracing
  payload: object; // event-specific
}
```

The major version `.vN` is part of the **event type and the topic name**. The semantic patch version
lives only in `event_version`.

## Topics

```text
{tenant_id}.{domain}.{entity}.{action}.v{N}      e.g. tenant_abc.procurement.po.created.v1
platform.events                                  platform.* events — shared, NOT tenant-scoped
{tenant_id}.dlq                                  ONE DLQ per tenant, not per domain
```

**Topics are provisioned explicitly and lazily.** `allowAutoTopicCreation: false` on producers and
`auto.create.topics.enable=false` on every real broker, so Kafka never creates one implicitly. A
tenant's topic is created by `KafkaProducer` **on the first publish that needs it**, and its DLQ on
the first failure. Do _not_ provision the catalogue at onboarding — that made topic count scale with
customer headcount (46 topics / 414 replicas per tenant at RF=3) instead of with usage. Enterprise
tenants are the exception: they get a dedicated namespace and are provisioned eagerly by the Phase 25
workflow.

Shared consumers subscribe by **RegExp across per-tenant topics** under a `{service}.shared` group
and **validate the `tenant_id` header before processing**. The Go workers use `franz-go`
(`kgo.ConsumeRegex`) — `sarama` was replaced because it has no pattern subscription and it
`json.Unmarshal`ed Avro-framed bytes.

## Schema Registry

Confluent Schema Registry, Avro, compatibility **`BACKWARD_TRANSITIVE`** — a new schema must be
readable by _all_ previous versions, not just the immediately preceding one.

Subject naming is **RecordNameStrategy**: the subject is the canonical event type, one schema shared
across all tenants. _Not_ `{topic_name}-value` — topics carry a `{tenant_id}.` prefix, so
TopicNameStrategy would duplicate every schema per tenant.

| Allowed                                  | Forbidden             |
| ---------------------------------------- | --------------------- |
| Add an optional field **with a default** | Rename a field        |
| Add a new enum value **at the end**      | Remove a field        |
|                                          | Change a field's type |
|                                          | Reorder enum values   |

Register the schema **before** the first producer deployment (QM-9). Generate both the TypeScript
interface and the `.avsc` for every new event.

## Delivery — outbox, not fire-and-forget

Path 1 (business events) is the **Outbox Pattern**: the service writes to `outbox_events` in the
_same transaction_ as the business entity; `OutboxPoller` polls every 500 ms, publishes, and marks
`published=true`. Consumers check `event_id` in Redis (TTL 24 h) before processing — that is the
idempotency gate.

Failures retry 3× with exponential backoff (1 s, 5 s, 30 s), then go to the tenant's DLQ with an
alert. The originating topic stays readable from the `dlq.original_topic` header.

Path 2 (data replication to the lake via Debezium CDC → Kafka Connect → S3/Iceberg) is a **separate**
mechanism reading the PostgreSQL WAL, and is deferred — see spec §9.4.

## Emitting an event

1. Add the TypeScript interface to `packages/@cos/shared/src/events/` **and** the `.avsc` to
   `src/avro/`.
2. Register the schema in the registry.
3. Publish via the outbox inside the business transaction — never a direct produce.
4. **Every workflow state transition emits a typed event.** All RFQ and PO state machine transitions
   must produce one (master §9, spec §32.6).
5. Propagate `trace_id` / `span_id` in the Kafka headers (QM-8).

## Monitoring

`kafka_messages_produced_total`, `kafka_messages_consumed_total`, `kafka_consumer_lag`,
`kafka_dlq_depth`. Alerts: DLQ depth `> 0` for 5 min; consumer lag `> 5,000` for 2 min (warning) and
`> 50,000` (critical, pages on-call). The SLO is lag `< 1,000` per partition and event delivery
`> 99.9%`.

> 📎 `context/00_master_construction_os.md` § CROSS-SERVICE EVENT CONTRACT SPEC (the field-level
> payload for each critical event) and § Phase 8 ·
> [`specifications/15-event-driven-workflow.md`](../specifications/15-event-driven-workflow.md) ·
> [`specifications/32-implementation-specifications.md`](../specifications/32-implementation-specifications.md)
> §32.4 (authoritative payloads).
