// Confluent Schema Registry client wrapper.
// Compatibility mode: BACKWARD_TRANSITIVE (spec §32.4; C-NEW-1 resolved 2026-05-27).
// Subject naming: {topic-name}-value

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

const AVRO_DIR = join(__dirname, '../avro');

/** Load .avsc file from the avro directory. */
export function loadAvroSchema(filename: string): string {
  return readFileSync(join(AVRO_DIR, filename), 'utf-8');
}

/**
 * Register or retrieve a schema ID for a given subject.
 * Subject naming: {topic-name}-value
 * Called once per event type at producer startup.
 */
export async function registerSchema(
  subject: string,
  avscFilename: string,
): Promise<number> {
  const registry = getSchemaRegistry();
  const schema = loadAvroSchema(avscFilename);
  const { id } = await registry.register(
    { type: SchemaType.AVRO, schema },
    { subject },
  );
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
