// Confluent Schema Registry client wrapper.
// Compatibility mode: BACKWARD_TRANSITIVE — enforced via ensureCompatibilityMode() at producer startup.
// Source: spec §32.4; C-NEW-1 resolved 2026-05-27; QM-9.
// Subject naming: RecordNameStrategy — the subject is the canonical event_type (one schema per event,
// shared across all tenants); NOT {topic-name}-value, since topics carry a {tenant_id}. prefix (§32.4).

import { SchemaRegistry, SchemaType } from '@kafkajs/confluent-schema-registry';
import { readFileSync } from 'fs';
import { join } from 'path';

let _registry: SchemaRegistry | null = null;

export function getSchemaRegistry(): SchemaRegistry {
  if (_registry) return _registry;
  const url = process.env['SCHEMA_REGISTRY_URL'] ?? 'http://localhost:8081';
  _registry = new SchemaRegistry({ host: url });
  return _registry;
}

// Avro schemas ship inside this package (src/avro -> dist/avro via scripts/copy-avro.mjs).
// __dirname is <pkg>/src at test time and <pkg>/dist after build; 'avro' resolves under both.
const AVRO_DIR = join(__dirname, 'avro');

/**
 * Set global Schema Registry compatibility mode to BACKWARD_TRANSITIVE.
 * Must be called once at KafkaProducer startup before any schema is registered.
 * Confluent Schema Registry defaults to BACKWARD on boot — this call enforces the stricter mode.
 * Source: spec §32.4; QM-9 (BACKWARD_TRANSITIVE: all historical consumers can read any newer schema).
 */
export async function ensureCompatibilityMode(): Promise<void> {
  const url = process.env['SCHEMA_REGISTRY_URL'] ?? 'http://localhost:8081';
  const response = await fetch(`${url}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/vnd.schemaregistry.v1+json' },
    body: JSON.stringify({ compatibility: 'BACKWARD_TRANSITIVE' }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Schema Registry compatibility set failed: ${response.status} ${body}`);
  }
}

/** Load .avsc file from the avro directory. */
export function loadAvroSchema(filename: string): string {
  return readFileSync(join(AVRO_DIR, filename), 'utf-8');
}

/**
 * Register or retrieve a schema ID for a given subject.
 * Subject naming: RecordNameStrategy — the caller passes the canonical event_type as `subject` (§32.4).
 * Called once per event type at producer startup.
 */
export async function registerSchema(subject: string, avscFilename: string): Promise<number> {
  const registry = getSchemaRegistry();
  const schema = loadAvroSchema(avscFilename);
  const { id } = await registry.register({ type: SchemaType.AVRO, schema }, { subject });
  return id;
}

/** Encode a message payload to Avro binary using the registered schema ID. */
export async function encodeAvro(schemaId: number, payload: unknown): Promise<Buffer> {
  return getSchemaRegistry().encode(schemaId, payload);
}

/** Decode an Avro-encoded Kafka message value. */
export async function decodeAvro(buffer: Buffer): Promise<unknown> {
  return getSchemaRegistry().decode(buffer);
}
