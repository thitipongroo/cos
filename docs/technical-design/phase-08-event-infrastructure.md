---
title: 'Phase 8 — Event-driven Infrastructure'
version: '0.1.0'
status: Draft
last_updated: '2026-08-21'
authors:
  - thitipongroo
related_docs:
  - README.md
  - ../specifications/15-event-driven-workflow.md
  - ../specifications/16-enterprise-event-flow.md
  - ../specifications/32-implementation-specifications.md
  - ../../context/00_master_construction_os.md
---

# Phase 8 — Event-driven Infrastructure

> Compiled from `context/00_master_construction_os.md` § PHASE 8 — EVENT-DRIVEN INFRASTRUCTURE
> COMMAND and the specification sections cited inline. `docs/specifications/` wins on any conflict;
> see [README § Authority](README.md).

---

## 1. Overview & goals

Build the Kafka event backbone — the shared event SDK, the outbox pattern and the DLQ — that every
domain service publishes through (`00_master` § Phase Register, Phase 8 objective).

Done when `allowAutoTopicCreation: false` holds, DLQ and replay are present, and event delivery above
99.9% is verified (Phase 8 exit).

**Build-order note.** Phase 8 is classified Stage 3 by _capability_, but it is a build-order
prerequisite for Phase 3–7 because all domain services depend on the SDK it produces.
`32-implementation-specifications` §32.1 states this exception explicitly — the "never implement a
Stage N+1 feature during Stage N" rule governs domain feature work, not this infrastructure.

---

## 2. Scope

Authoritative list: `00_master` § PHASE 8 COMMAND → `Generate:` and `Constraints:`.

### In scope

Schema Registry deployment and rules, event versioning policy, Kafka cluster and topic
configuration, the `@cos/shared` event SDK (producer, consumer, outbox publisher and poller),
the DLQ with retry middleware, OTel trace propagation over Kafka headers, and Prometheus metrics for
producer, consumer and DLQ.

### Out of scope

- Domain event payloads themselves → the phase that owns the entity
- **Path 2 data replication** (Debezium CDC → Kafka Connect S3 sink → Iceberg data lake) →
  Phase 17. `09-data-architecture` §9.4 defines it as an independent path; Debezium reads the
  PostgreSQL WAL and is **not** the outbox mechanism built here.
- Consumer-side business logic → Phase 13 (KG worker), Phase 14 (analytics), Phase 20 (notification)

---

## 3. Architecture

Kafka is an **internal event bus within the monolith boundary**, not a signal to split services
(`00_master` § GLOBAL TECHNOLOGY DECISION MAP; `01_build_priority_execution` § Architectural
Constraints rule 2). Producers and consumers run inside the NestJS process in MVP; Kafka itself is
external infrastructure.

Two independent data paths (`09-data-architecture` §9.4, restated in `00_master` § PHASE 8 COMMAND):

```text
Path 1 — business events (THIS PHASE)
  app → PostgreSQL (same transaction writes outbox_events) → OutboxPoller → Kafka → consumers

Path 2 — data replication (Phase 17, deferred)
  PostgreSQL WAL → Debezium CDC → Kafka → Kafka Connect S3 sink → S3 + Iceberg → ClickHouse
```

They are not the same mechanism and must not be conflated: the outbox guarantees delivery atomically
with a business write; Debezium captures every row change including writes that never went through
the event bus.

Topic and subject model (`07-multi-tenant-architecture` §7.3; `15-event-driven-workflow` §15.6;
`32-implementation-specifications` §32.4):

| Concept                 | Format                                            | Example                                        |
| ----------------------- | ------------------------------------------------- | ---------------------------------------------- |
| Event type              | `{domain}.{entity}.{action}.v{N}` — no prefix     | `procurement.po.created.v1`                    |
| Kafka topic             | `{tenant_id}.{domain}.{entity}.{action}.v{N}`     | `tenant_abc.procurement.po.created.v1`         |
| Platform events         | shared `platform.events` topic, not tenant-scoped | `platform.enterprise.contract_signed.v1`       |
| DLQ                     | `{tenant_id}.dlq` — **one per tenant**            | originating topic kept in `dlq.original_topic` |
| Schema Registry subject | canonical event type (RecordNameStrategy)         | one schema per event, shared across tenants    |

**Why one DLQ per tenant and not per domain.** The §7.3 isolation guarantee is about tenants; a DLQ
per domain multiplied every tenant's topic count by ten for a separation the spec never required.

**Why RecordNameStrategy and not TopicNameStrategy.** Topic names carry a `{tenant_id}.` prefix, so
TopicNameStrategy would register a duplicate schema per tenant (§32.4).

Shared consumers subscribe with a per-tenant topic RegExp under a `{service}.shared` group, so a
single group also picks up tenants onboarded after the consumer started; the `tenant_id` header is
validated against the decoded envelope before processing, and a missing or mismatched header routes
the message to the DLQ (§7.3).

---

## 4. Data model

One table, replicated into each service's PostgreSQL schema
(`00_master` § PHASE 8 COMMAND → Outbox Pattern):

| `outbox_events` | Type        | Note                                      |
| --------------- | ----------- | ----------------------------------------- |
| `id`            | UUID        |                                           |
| `event_type`    | string      | canonical event type                      |
| `payload`       | JSONB       |                                           |
| `published`     | boolean     | set true after a successful Kafka produce |
| `created_at`    | TIMESTAMPTZ |                                           |
| `published_at`  | TIMESTAMPTZ |                                           |

The service writes to `outbox_events` **in the same transaction** as the business entity;
`OutboxPoller` polls every 500 ms and publishes unpublished rows. Consumer idempotency is a Redis
check on `event_id` with a 24-hour TTL.

Kafka configuration (`00_master` § PHASE 8 COMMAND → Kafka Configuration):

| Setting            | Production                                   | Development |
| ------------------ | -------------------------------------------- | ----------- |
| Brokers            | 3 minimum                                    | 1           |
| Replication factor | 3                                            | 1           |
| Min ISR            | 2                                            | —           |
| Default retention  | 7 days (SMB / mid-market, §7.3)              | —           |
| Log compaction     | enabled for entity-state topics              | —           |
| Max message size   | 1 MB — larger payloads go to S3 by reference | —           |

---

## 5. API contract

**Phase 8 exposes no HTTP endpoints.** Its contract is the SDK surface exported by `@cos/shared`
(`00_master` § PHASE 8 COMMAND → Shared Event SDK):

- TypeScript interfaces for every event envelope and payload
- Avro schema files, generated and versioned
- `KafkaProducer` — wraps KafkaJS, validates against the schema before publish
- `KafkaConsumer` — wraps KafkaJS, adds the Redis idempotency gate
- `OutboxPublisher` with `OutboxPoller`

Rule 34 binds this package: `@cos/shared` is imported by React Native, the browser service worker and
Node.js, so it must carry no runtime import of a Node.js-only package. `OutboxPoller`, which polls a
database, therefore lives in `backend/src/` rather than in the shared package.

---

## 6. Events

Phase 8 defines the **envelope and the rules**, not the payloads. The canonical payload table is
`32-implementation-specifications` §32.4 (21 numbered event types).

Schema evolution (`00_master` § PHASE 8 COMMAND):

| Allowed                              | Forbidden           |
| ------------------------------------ | ------------------- |
| add an optional field with a default | rename a field      |
| add a new enum value at the end      | remove a field      |
|                                      | change a field type |
|                                      | reorder enum values |

Compatibility mode is `BACKWARD_TRANSITIVE` — stricter than `BACKWARD`: a new schema must be readable
by **all** previous versions, not only the immediately preceding one (§32.4; QM-9). The major version
lives in the event type and the topic name (`.v1` → `.v2`); the envelope's `event_version` field
carries the semantic patch version within a major.

The envelope's exact field list is contested across three sources — see § 14 OQ-2.

---

## 7. Sequence / flows

### Publish (outbox path)

```text
service handler
  ├─ BEGIN TX → write business row → write outbox_events row → COMMIT
  └─ OutboxPoller (500 ms) → KafkaProducer.publish()
                              ├─ resolve schema from the canonical catalogue
                              ├─ create the tenant topic if this is its first publish
                              └─ on success → outbox_events.published = true
```

### Consume

```text
KafkaConsumer ({service}.shared group, per-tenant topic RegExp)
  ├─ validate the tenant_id header against the decoded envelope   → mismatch = DLQ
  ├─ Redis idempotency check on event_id (TTL 24 h)               → seen = drop
  └─ handler → ack
```

### Failure

```text
handler throws → retry 1 s → 5 s → 30 s → publish to {tenant_id}.dlq
              → dlq.original_topic header preserved → alert on DLQ depth > 0
```

Trace context propagates on Kafka headers, so a consumer span is a child of the producing request's
span (QM-8; `00_master` § PHASE 8 COMMAND → OpenTelemetry trace propagation).

---

## 8. Failure modes & rollback

| Failure                       | Behaviour                                                                                            | Source                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------- |
| Handler throws                | 3 attempts, exponential backoff 1 s / 5 s / 30 s, then DLQ + observability alert                     | § PHASE 8 COMMAND      |
| DLQ receives anything         | `KafkaDLQNonEmpty` fires on `kafka_dlq_depth > 0` for 5 min                                          | `00_master` § PHASE 15 |
| Consumer falls behind         | alert at lag > 5,000 for 2 min; **critical** and pages on-call at > 50,000                           | QM-14; § PHASE 15      |
| Duplicate delivery            | Redis `event_id` gate makes processing exactly-once at the handler                                   | § PHASE 8 COMMAND      |
| Producer crashes after COMMIT | outbox row stays `published = false`; the poller republishes — this is the whole point of the outbox | §9.4 Path 1            |
| Wrong tenant header           | message routed to DLQ before the handler runs                                                        | §7.3                   |
| Topic does not exist          | created by `KafkaProducer` on first publish; brokers have `auto.create.topics.enable=false`          | §7.3                   |
| Breaking schema published     | Schema Registry rejects it under `BACKWARD_TRANSITIVE` before the producer can deploy                | §32.4                  |

**Rollback.** A schema change cannot be rolled back by deleting a subject version — consumers may
already have read it. The rollback path is a new major version (`.v2`) plus a migration consumer
bridge (§ PHASE 8 COMMAND → Event Versioning Strategy).

---

## 9. Security

- `tenant_id` prefixes every non-platform topic and is validated in the header before processing —
  queue isolation is one of the five isolation layers in `07-multi-tenant-architecture` §7.2
- DLQs are tenant-scoped: tenant A's DLQ cannot receive tenant B's messages (§7.3)
- Enterprise tenants get a dedicated Kafka namespace or cluster (§7.3)
- Payloads over 1 MB go to S3 and are carried by reference, so large PII blobs do not sit in topic
  retention (§ PHASE 8 COMMAND)
- PII must not appear in event payloads used for logging or tracing (QM-5)

---

## 10. Observability

Metrics required by `00_master` § PHASE 15 for this surface:

`kafka_messages_produced_total` · `kafka_messages_consumed_total` · `kafka_consumer_lag` ·
`kafka_dlq_depth`

Alerts: `KafkaDLQNonEmpty` (depth > 0 for 5 min) and `KafkaConsumerLagCritical` (lag > 50,000 —
pages on-call, severity critical).

Every Kafka event carries `trace_id` and `span_id` in its headers, and every cross-service call
creates a child span (QM-8).

---

## 11. Testing & acceptance

- Unit: producer, consumer, outbox pattern, idempotency — 100% lines and branches (QM-1); Kafka
  consumer idempotency is on the Phase 18 mandatory-coverage list
- Integration: `packages/@cos/shared/test/kafka/` on a real single-broker `@testcontainers/kafka`
  instance, with the Schema Registry and Redis mocked. Two cases are named in the phase command:
  (a) producer publishes → consumer receives the same payload; (b) the same `event_id` is processed
  exactly once
- Rule 30 applies to `OutboxPoller`: it sleeps internally, so tests must use
  `await jest.runAllTimersAsync()` — `jest.runAllTimers()` does not drain the microtask queue between
  retries and the test hangs

---

## 12. Implementation status

Verified on **2026-08-21** against this working tree (Rule 36).

| Generate item                    | Status     | Evidence                                                                                                |
| -------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| Docker Compose: Kafka + Registry | ✅ present | `docker-compose.yml` → `kafka` (`confluentinc/cp-kafka:8.3.0`, KRaft), `schema-registry`                |
| Kubernetes manifests             | ✅ present | `infrastructure/kubernetes/kafka/kafka-statefulset.yaml`, `schema-registry-deployment.yaml`             |
| `KafkaProducer`                  | ✅ present | `packages/@cos/shared/src/kafka/producer.ts`                                                            |
| `KafkaConsumer` + idempotency    | ✅ present | `kafka/consumer.ts`; `__tests__/consumer.idempotency.spec.ts`                                           |
| Outbox publisher / poller        | ✅ present | `kafka/outbox.ts`; `backend/src/shared/events/event-outbox.service.ts`, `outbox-poller.service.ts`      |
| DLQ + retry                      | ✅ present | `kafka/dlq.ts` + `__tests__/dlq.spec.ts`                                                                |
| Schema Registry client           | ✅ present | `kafka/schema-registry.client.ts` + spec                                                                |
| Topic catalogue / provisioner    | ✅ present | `kafka/topic-catalog.ts`, `kafka/topic-provisioner.ts` + specs — header cites §7.3, §15.6/§15.7, §32.4  |
| Prometheus metrics               | ✅ present | `kafka/metrics.ts` + spec                                                                               |
| Avro schemas                     | ✅ present | `packages/@cos/shared/src/avro/` → 61 files: 60 canonical `*.v1.avsc` + `base-event-envelope.avsc`      |
| Integration tests                | ✅ present | `packages/@cos/shared/test/kafka/`                                                                      |
| Unit tests across the SDK        | ✅ present | `src/kafka/__tests__/` → 8 spec files                                                                   |
| §32.4 canonical schema migration | ⚠️ partial | no legacy-named `.avsc` remains, but 11 of the 27 required canonical names have no file — see § 14 OQ-6 |

---

## 13. Dependencies & risks

**Dependencies:** Phase 2. Phase 8 **blocks Phase 3–7** — the blocking rule is stated in both
`32-implementation-specifications` §32.1 and `00_master` § PHASE DEPENDENCY GRAPH.

**Risks:** `R-09` — event-delivery / data-consistency loss. Scoring, owner, mitigation and
early-warning metric are in `00_master` § Risk Register.

---

## 14. Open questions / NOT SPECIFIED

| ID    | Question                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Status                     |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| OQ-2  | The Base Event Envelope has **8** fields in `32-implementation-specifications` §32.4, **10** in `15-event-driven-workflow` §15.6 (adding `trace_id`, `span_id`), and **9** in the committed `base-event-envelope.avsc`, where `trace_id` and `span_id` are `["null","string"]` with default `null`. §32 declares itself the winner on conflict. Because the two extra fields are nullable with defaults, the Avro schema stays `BACKWARD_TRANSITIVE`-compatible with the 8-field shape — the divergence is additive, not breaking.                                                            | Open — needs a PO ruling   |
| OQ-3  | `15-event-driven-workflow` §15.6 contradicts itself within one section: the envelope is "CloudEvents v1.0-**inspired** … **NOT** a strict CloudEvents-compliant envelope", while ECO-001 in the same section reads "**Envelope:** CloudEvents v1.0 (**normative**)".                                                                                                                                                                                                                                                                                                                          | Open — spec self-conflict  |
| OQ-4  | `07-multi-tenant-architecture` §7.3 states both "**Created on first publish, not at tenant onboarding**" and "the full canonical event catalogue is **materialised per tenant, created idempotently at tenant onboarding**". Its own step 3 then repeats the first-publish rule for SMB / mid-market. `00_master` § Always agrees with first-publish, so the onboarding sentence reads as stale text.                                                                                                                                                                                         | Open — spec self-conflict  |
| OQ-6  | **Closed 2026-08-22.** §32.4's 27-row "Required Canonical Names" table is replaced by a verified status: no legacy-named `.avsc` remains, and the ten canonical names that were never created have zero references in code, zero `EVENT_AVSC_MAP` entries and no source outside that table — so they were dropped rather than carried as pending work.                                                                                                                                                                                                                                        | Closed                     |
| OQ-16 | **One event name is contested.** §32.4's payload table (#16) calls it `finance.budget.variance_detected.v1`; the schema on disk, the `EVENT_AVSC_MAP` key, `00_master` § Phase 7 `Generate:`, § Phase 20 notification triggers and `20-ux-flow` §20.7 all call it `finance.variance.alert.v1`. Specs win by the authority rule, but the type is on the wire, so aligning to the spec is a **breaking change** needing a `.v2` plus a migration consumer bridge (§32.4 Event Versioning) — not a rename. Either §32.4 #16 changes to match the implementation, or the implementation migrates. | Open — needs a PO decision |

Recorded, not resolved — per [README § Open questions](README.md#open-questions-register).
