# Phase 8 — Event-Driven Infrastructure

> Moved out of `context/00_master_construction_os.md` on 2026-09-02, verbatim.
> That file keeps the index row pointing here; `.claude/skills/phase-index/SKILL.md`
> is the map. Depends on Phase 2 · SaaS Maturity Stage 3.
>
> Rule 36 applies at the end of this phase and Rule 38 before it starts.

```text
Build event-driven infrastructure.

Schema Registry:

- Solution: Confluent Schema Registry (open-source, self-hosted)
- Version: confluent-schema-registry 7.x
- Deployment: containerized alongside Kafka
- Schema format: Avro (primary) + TypeScript interfaces generated from Avro
- Subject naming convention: RecordNameStrategy — canonical event type (e.g. "procurement.po.created.v1"); one schema per event, shared across tenants (NOT {topic-name}-value — topics carry a {tenant_id}. prefix; source: spec §32.4)
- Compatibility mode: BACKWARD_TRANSITIVE

  (new schema must be readable by ALL previous versions, not just the immediately preceding one;
   this is stricter than BACKWARD — every historical consumer can read any newer schema version;
   source: spec §32.4)

- Schema evolution rules:

    ALLOWED:   add optional field with default value
    ALLOWED:   add new enum value (at end of enum list)
    FORBIDDEN: rename field
    FORBIDDEN: remove field
    FORBIDDEN: change field type
    FORBIDDEN: reorder enum values

Event Versioning Strategy:

- Version carried in event envelope: event_version field (semver string, e.g. "1.0")
- Minor version: new optional fields added (backward compatible — same schema subject; carried in envelope event_version, e.g. "1.0" → "1.1")
- Major version: breaking change → new schema subject

  (e.g. "procurement.po.created.v2") and migration consumer bridge

- Major version (.vN) IS part of the event type AND the Kafka topic name (e.g. ...created.v1 → ...created.v2); the semver patch version lives in the envelope event_version field only (source: spec §15.6, §32.4)

Kafka Configuration:
  Cluster: 3 brokers minimum (production) / 1 broker (development)
  Replication factor: 3 (production) / 1 (development)
  Min ISR: 2 (production)
  Topic naming (per-tenant, §7.3, §15.6): {tenant_id}.{domain}.{entity}.{action}.v{N}
                e.g. tenant_abc.construction.project.created.v1, tenant_abc.procurement.po.created.v1
                CloudEvents type / event_type (no tenant prefix): {domain}.{entity}.{action}.v{N}
                Platform events (platform.*): shared "platform.events" topic, not tenant-scoped (§15.7)
                DLQ: {tenant_id}.dlq — ONE per tenant, not per domain. The §7.3 guarantee is
                about tenants; a DLQ per domain multiplied every tenant's topic count by ten.
                Originating domain stays readable from the dlq.original_topic header.
  Topic provisioning: explicit — producers use allowAutoTopicCreation:false AND
                auto.create.topics.enable is false on every real broker, so Kafka never creates a
                topic implicitly. Topics are created ON FIRST PUBLISH by KafkaProducer, and a
                tenant's DLQ on first failure. Do NOT provision the catalogue at onboarding: that
                made topic count scale with customer headcount (46 topics / 414 replicas per
                tenant at RF=3) instead of usage. Exception: enterprise tenants get a dedicated
                namespace/cluster and stay eagerly provisioned (Phase 25 workflow).
                (source: spec §7.3 Topic provisioning)
  Consumer subscription: shared group {service}.shared subscribes per-tenant topics via RegExp
                (^[^.]+\.{event_type}$) + validates tenant_id header before processing (§7.3)
  Default retention: 7 days
  Log compaction: enabled for entity state topics — defined 2026-08-23.
                An ENTITY STATE TOPIC is one whose events describe the current state of a single
                durable entity, named by a stable id in the payload, such that keeping only the
                LATEST message per entity still leaves a correct picture. That is exactly the trade
                compaction makes, so it is the only shape of topic that can survive it. Records of
                occurrences — a delivery received, a safety incident, a daily report, a check-in —
                are the opposite and must never be compacted: each is a separate fact with no newer
                version to replace it.
                Such a topic is KEYED BY THAT ENTITY ID, not by tenant_id as every other topic is.
                The two settings are inseparable and are declared together in ENTITY_STATE_TOPICS
                (packages/@cos/kafka/src/topic-catalog.ts), because compacting a
                tenant-keyed topic would leave ONE surviving event per tenant and delete the rest.
                A publish whose payload lacks the id is refused rather than sent unkeyed: an unkeyed
                message is spread round-robin, so compaction could never pair an entity's old and
                new versions, and the topic would grow forever while reporting itself compacted.
                The list is explicit and short. This line previously read "project.project.*, etc.";
                the project family is the canonical construction.project.* (see the numbered event
                mapping above, project.created -> [construction.project.created.v1]) and "etc."
                named nothing. Adding a topic is a data-retention decision, made one entry at a
                time. construction.project.risk_raised.v1 and .risk_status_changed.v1 are
                deliberately excluded: they carry project_id but are events about a RISK, and keying
                them by project would collapse every risk on a project into the last one raised.
  Max message size: 1MB (large payloads → store in S3, reference in event)

Shared Event SDK (@construction-os/shared package):
  Exports:
    - TypeScript interfaces for all event envelopes and payloads
    - Avro schema files (generated, versioned)
    - KafkaProducer abstraction (wraps KafkaJS with schema validation)
    - KafkaConsumer abstraction (wraps KafkaJS with idempotency support)
    - OutboxPublisher (for outbox pattern — see below)

Outbox Pattern:
  Purpose: guarantee event DELIVERY — a queued event survives a broker, registry or
           network outage instead of being logged and dropped
  Guarantee: DURABLE, not transactionally atomic (ADR-094, accepted 2026-08-19). The
           outbox INSERT is its own transaction, not the business row's, so a process
           that dies between the two loses the event — as the inline publish it replaced
           also did. Every other failure mode is now recoverable.
  Implementation:
    - outbox_events table in each service's PostgreSQL schema
    - outbox_events: { id UUID, event_type, payload JSONB, published BOOLEAN,
                       created_at TIMESTAMPTZ, published_at TIMESTAMPTZ }
    - Service: EventOutboxService.publish(event) — one INSERT into platform.outbox_events,
               immediately after the business write commits. publish() never throws.
    - Atomic form: EventOutboxService.write(tx, event) writes inside a caller-supplied
               transaction and DOES throw. Available for a domain that needs it; no
               caller uses it yet (ADR-094 §Decision).
    - OutboxPoller: background process, polls every 500ms, publishes unpublished
    - OutboxPoller: marks published=true after successful Kafka produce
    - Idempotency: a consumer claims kafka:processed:{groupId}:{event_id} in Redis
      (SET NX, TTL 24h) before processing. The GROUP is part of the key — several
      event types have two or three subscribing groups, and a key without the group
      lets the first claimer suppress the event for every other group (TDD OQ-49).

Dead Letter Queue (DLQ):
  Pattern: failed messages → {original-topic}.dlq topic
  Retry: 3 attempts with exponential backoff (1s, 5s, 30s)
  After max retries: publish to DLQ topic + alert via observability

Monitoring:
  - Consumer lag: Prometheus kafka_consumer_lag gauge
    (corrected 2026-08-23: this line named `consumer_group_lag`, which is not a metric — it
     reads as the `consumer_group` LABEL on kafka_messages_consumed_total conflated with the
     lag gauge. The Phase 15 metric catalogue at §Phase 15 Metrics has always listed
     `kafka_consumer_lag (gauge)`, and that is the name @cos/tracing, @cos/shared/kafka/metrics,
     both Grafana dashboards and the Prometheus alert rule all use.)
  - Producer errors: Prometheus kafka_producer_error_total counter
  - DLQ depth: alert when DLQ topic message count > 0

DATA FLOW ARCHITECTURE (spec §9.4 — two independent paths):
  Path 1 — Business Event Flow (THIS PHASE — Outbox Pattern):
    Operational App → Operational DB (PostgreSQL) → Outbox Pattern → Kafka → Downstream Services
    Purpose: real-time domain event coordination between services
    Implementation: OutboxPoller above

  Path 2 — Data Replication to Data Lake (FUTURE — Debezium CDC, implement with Phase 17 DevOps):
    PostgreSQL → Debezium CDC (reads WAL directly — NOT Kafka consumer) → Kafka → Kafka Connect S3 Sink → Data Lake (S3 + Apache Iceberg) → ClickHouse → AI Pipeline / Analytics
    Purpose: row-level DB change replication for full data fidelity in the lake (even for direct DB writes that bypass the business event bus)
    Note: Debezium reads PostgreSQL WAL independently of Outbox Pattern — these are NOT the same mechanism
    DebeziumCDCPipeline:
      DECIDED: Debezium 2.x + Kafka Connect 3.x; implement with Phase 17 data lake infrastructure
      Interface: { configureDebeziumConnector(pgSource, kafkaSink): void }
      Trigger: Phase 17 (data lake infrastructure ready); required by spec §4.4 and §9.4

Generate:

- Docker Compose: Kafka (KRaft mode, no ZooKeeper), Schema Registry
- Kubernetes manifests at infrastructure/kubernetes/kafka/:
    kafka-statefulset.yaml         — Kafka 3-broker StatefulSet (KRaft mode, production)
    schema-registry-deployment.yaml — Confluent Schema Registry Deployment + Service
- @construction-os/shared package:

    - all TypeScript event interfaces (from Event Contract spec section)
    - Avro schemas for all events
    - KafkaProducer class with schema validation before publish
    - KafkaConsumer class with idempotency Redis check
    - OutboxPublisher with OutboxPoller

- DLQ consumer and retry middleware
- OpenTelemetry trace propagation via Kafka headers
- Prometheus metrics for producer, consumer, DLQ
- Confluent Schema Registry client integration
- Unit tests: producer, consumer, outbox pattern, idempotency
- Integration tests: packages/@cos/kafka/test/kafka/kafka.integration.spec.ts (moved from
    @cos/shared by ADR-055)
    - Add to @cos/kafka devDependencies: testcontainers ^10.9.0, @testcontainers/kafka ^10.9.0 (Rule 26)
    - Add script to @cos/kafka package.json: "test:integration": "jest --testPathPatterns='test/'" (Rule 27)
      Note: turbo.json test:integration task already exists — no change needed
    - Use @testcontainers/kafka KafkaContainer for a real single-broker Kafka instance
    - Mock Schema Registry (Avro encoding covered in src/kafka/__tests__/schema-registry.client.spec.ts)
    - Mock Redis idempotency store (logic covered in src/kafka/__tests__/consumer.idempotency.spec.ts)
    - Test cases: (a) producer publishes event → consumer receives same payload
                  (b) same event_id processed exactly once (idempotency gate)

Constraints:

- Schema Registry must be running before first KafkaProducer deployment (QM-9 BACKWARD_TRANSITIVE)
- Before marking Phase 8 complete: read every Generate item above line by line, run ls/grep
  to verify each exists on disk, show output — Rule 36

```
