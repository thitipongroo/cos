# Construction OS — IoT Ingestion Worker (Go)

**Runtime:** Go 1.26
**Deployable:** Separate from the NestJS monolith
**Spec:** [`33-digital-twin-iot`](../../docs/specifications/33-digital-twin-iot.md) §33.3 (write path), §33.8

## Purpose

Bridges the MQTT broker to Kafka: subscribes to device telemetry on **EMQX** (MQTT 5.0) and produces
one Kafka event per message for the Digital Twin Service to consume.

```text
IoT device --(MQTT 5.0, X.509)--> EMQX --> [this worker] --> Kafka --> Digital Twin / TimescaleDB
```

This custom worker exists because EMQX's native Kafka data-bridge is an **Enterprise (paid)** feature
and is deliberately not used — the platform runs EMQX open-source (Apache-2.0). See §33.8.

> ⚠️ **MOCK-VERIFIED ONLY.** There is no EMQX broker in the Compose stack and no physical device, so
> the MQTT-subscribe and Kafka-produce paths have never run end to end. The pure transform they drive
> (`internal/ingest`) is unit-tested. Treat the transport wiring as unproven until a broker exists.

## Public API

This worker has **no request API** — it is an MQTT subscriber loop. Its two contracts are:

### Subscribed MQTT topic filter (QoS 1)

```text
cos/v1/tenants/+/devices/+/telemetry
```

### Produced Kafka topic

```text
{tenant_id}.equipment.telemetry.location.v1
```

Event body: `{ event_type, event_version, tenant_id, equipment_id, ...attributes }`. The Digital Twin
Service resolves the entity by `equipment_id` against `twin_entities.physical_ref`.

**HTTP surface:** `GET /health/live` only — a liveness endpoint for the Kubernetes probe, started
_after_ MQTT connects so the pod reports live only when it is actually subscribed.

### Tenant authority — read this before changing the transform

`tenant_id` and `device_id` are taken from the **MQTT topic**, never from the payload. EMQX
authenticates each device with a per-device X.509 client certificate and enforces a default-deny
topic ACL binding that client to its own tenant/device namespace, so a device physically cannot
publish under another tenant's prefix. A `tenant_id` in the payload is untrusted: if present it must
equal the topic tenant, otherwise the message is treated as a spoofing attempt and rejected.

Topics are created **explicitly on first publish** (the Go port of `KafkaProducer.ensureTopic`).
`kgo.AllowAutoTopicCreation()` is deliberately absent — `auto.create.topics.enable` is false on every
real broker.

## Dependencies

- `github.com/eclipse/paho.mqtt.golang` — MQTT 5.0 client
- `github.com/twmb/franz-go` (+ `kadm`) — Kafka client and admin, matching `kg-ingestion-worker` and
  `analytics-worker`; `sarama` is not used repo-wide (no regex subscribe, mishandles Avro framing)

## Configuration

| Variable          | Default                | Purpose                              |
| ----------------- | ---------------------- | ------------------------------------ |
| `MQTT_BROKER_URL` | `tcp://localhost:1883` | EMQX broker address                  |
| `KAFKA_BROKERS`   | — (see `internal/`)    | Comma-separated Kafka bootstrap list |
| `PORT`            | see `internal/health`  | Health-endpoint listen port          |

## Usage example

```bash
# Build and run
cd services/iot-ingestion-worker
go build ./... && go run ./cmd/iot-ingestion-worker

# Liveness
curl http://localhost:$PORT/health/live
```

## Tests

```bash
cd services/iot-ingestion-worker
go test ./...
```
