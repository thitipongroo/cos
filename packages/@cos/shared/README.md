# @cos/shared

Typed Kafka event interfaces, Avro schemas, and the Kafka SDK used by all services.

## Purpose

Single source of truth for all cross-service event contracts (Phase 1 types; Phase 8 adds Avro schemas + Kafka SDK). Every service that produces or consumes Kafka events must use this package — never import `kafkajs` directly.

**Framework-agnostic:** imported by mobile (React Native/Metro), PWA (Service Worker), and Node.js services. No server-only runtime imports. See Rule 35.

## Public API

```typescript
// Event envelope and typed payloads
import type { BaseEventEnvelope } from '@cos/types';

// Kafka SDK (Node.js only — do NOT import in mobile/PWA)
import { KafkaProducer, KafkaConsumer } from '@cos/shared';
import { OutboxPublisher, OutboxPoller } from '@cos/shared';
import { DlqPublisher } from '@cos/shared';
import { initKafkaMetrics } from '@cos/shared';
```

All 15 canonical cross-service event types (see `src/events/`) conform to the BASE EVENT ENVELOPE:

```typescript
{
  (event_id, event_type, event_version, tenant_id, actor_id, occurred_at, correlation_id, payload);
}
```

## Dependencies

- `kafkajs` — Kafka client (Node.js only)
- `@confluentinc/schemaregistry` — Avro schema validation
- `ioredis` — idempotency key store
- `@cos/types` — `BaseEventEnvelope`, `CosRole`, enums

## Configuration

| Variable              | Description                              |
| --------------------- | ---------------------------------------- |
| `KAFKA_BROKERS`       | Comma-separated broker list              |
| `SCHEMA_REGISTRY_URL` | Confluent Schema Registry URL            |
| `REDIS_URL`           | Redis for consumer idempotency (TTL 24h) |

## Usage

```typescript
// Produce an event (with schema validation)
const producer = new KafkaProducer({ brokers, schemaRegistryUrl });
await producer.publish('construction.project.created.v1', envelope);

// Consume with idempotency guard
const consumer = new KafkaConsumer({ brokers, groupId: 'finance-consumer' });
await consumer.subscribe('construction.project.created.v1', async (msg) => { ... });

// Outbox pattern (guarantees at-least-once delivery with DB atomicity)
const outbox = new OutboxPublisher(prisma);
await outbox.publish(tenantId, 'construction.project.created.v1', payload); // within same tx as business write
```

## Notes

- Schema compatibility: `BACKWARD_TRANSITIVE` — new schema must be readable by ALL previous versions
- Avro schemas live in `src/avro/` — registered in Schema Registry before first producer deployment
- `OutboxPoller` (DB polling loop) lives in `backend/src/` NOT here — Node.js-only, would break mobile bundle (Rule 35)
- Integration tests: `test/kafka/kafka.integration.spec.ts` using `@testcontainers/kafka`
