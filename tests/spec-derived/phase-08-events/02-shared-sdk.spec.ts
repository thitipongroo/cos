/**
 * Phase 8 — the Shared Event SDK (master:3107-3113, 3157-3163).
 */
import * as fs from 'fs';
import * as path from 'path';
import { exists, read, repoRoot } from '../helpers';

const SHARED = 'packages/@cos/shared';
const index = read(`${SHARED}/src/index.ts`);

describe('Phase 8 · @cos/shared exports the five things master lists (master:3108-3113)', () => {
  it.each([
    ['KafkaProducer', 'src/kafka/producer.ts'],
    ['KafkaConsumer', 'src/kafka/consumer.ts'],
    ['OutboxPublisher / OutboxPoller', 'src/kafka/outbox.ts'],
  ])('%s exists', (_label, file) => {
    expect(exists(`${SHARED}/${file}`)).toBe(true);
  });

  it('the package index exports the Kafka surface', () => {
    expect(index).toMatch(/kafka\/producer/);
    expect(index).toMatch(/kafka\/consumer/);
    expect(index).toMatch(/kafka\/outbox/);
  });

  it('ships Avro schema files (master:3110, 3160)', () => {
    const dir = path.join(repoRoot, SHARED, 'src/avro');
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.avsc')).length).toBeGreaterThan(0);
  });

  it('ships TypeScript interfaces for the event envelopes (master:3109, 3159)', () => {
    const dir = path.join(repoRoot, SHARED, 'src/events');
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.ts')).length).toBeGreaterThan(0);
  });

  it('every event with an Avro schema also has a TypeScript interface (master:3159-3160)', () => {
    // "all TypeScript event interfaces" AND "Avro schemas for all events" — the two halves are the
    // same contract stated twice. A schema with no interface is a payload a producer can encode and
    // no consumer can type without hand-writing the shape at the call site.
    //
    // Three events carry their interface under the CONCEPTUAL name rather than the canonical wire
    // name — master:748 and :761 map `procurement.purchase_order.created` -> the canonical
    // `[procurement.po.created.v1]`, and `procurement.vendor_invoice.received` ->
    // `[procurement.invoice.received.v1]`. The `.avsc` files and the topic catalogue use the
    // canonical form, which is what goes on the wire; the filenames are the cosmetic half. They are
    // mapped here rather than counted as missing.
    const ALIASES: Record<string, string> = {
      'procurement.po.created.v1': 'procurement.purchase_order.created.v1',
      'procurement.po.status_changed.v1': 'procurement.purchase_order.status_changed.v1',
      'procurement.invoice.received.v1': 'procurement.vendor_invoice.received.v1',
    };
    const eventsDir = path.join(repoRoot, SHARED, 'src/events');
    const hasInterface = (name: string): boolean =>
      fs.existsSync(path.join(eventsDir, `${name}.ts`)) ||
      (ALIASES[name] !== undefined && fs.existsSync(path.join(eventsDir, `${ALIASES[name]}.ts`)));

    const missing = fs
      .readdirSync(path.join(repoRoot, SHARED, 'src/avro'))
      .filter((f) => f.endsWith('.avsc'))
      .map((f) => f.replace(/\.avsc$/, ''))
      // The envelope every event nests inside, not an event of its own.
      .filter((name) => name !== 'base-event-envelope')
      .filter((name) => !hasInterface(name));
    expect(missing).toEqual([]);
  });
});

describe('Phase 8 · the producer validates against a schema before publishing (master:3111, 3161)', () => {
  const producer = read(`${SHARED}/src/kafka/producer.ts`);

  it('resolves a schema for the event it is about to publish', () => {
    expect(producer).toMatch(/schema|avsc|registry/i);
  });

  it('refuses an event type the catalogue does not know', () => {
    // Publishing an unknown type is how a topic gets created under a name nothing consumes.
    expect(producer).toMatch(/EVENT_AVSC_MAP|CANONICAL_EVENT_TYPES|throw/);
  });
});

describe('Phase 8 · the consumer is idempotent (master:3112, 3124, 3162)', () => {
  const consumer = read(`${SHARED}/src/kafka/consumer.ts`);

  it('checks event_id in Redis before processing', () => {
    expect(consumer).toMatch(/event_id/);
    expect(consumer).toMatch(/redis/i);
  });

  it('uses a 24-hour TTL (master:3124)', () => {
    expect(consumer).toMatch(/86400|24 \* 60 \* 60/);
  });
});
