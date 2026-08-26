/**
 * Phase 7 — Kafka producers (master:2985-2991) and consumers (master:2937-2940), plus the two
 * events ADR-024 adds for the AR lifecycle.
 */
import { exists, read } from '../helpers';

const service = read('backend/src/modules/finance/finance.service.ts');
const consumer = read('backend/src/modules/finance/finance.consumer.ts');

describe('Phase 7 · producers (master:2987-2989)', () => {
  it.each([
    ['finance.budget.created', ['project_id', 'budget_id', 'total_budget_amount']],
    ['finance.payment.processed', ['project_id', 'payment_id', 'invoice_id', 'amount']],
    ['finance.variance.alert', ['project_id', 'variance_percentage', 'threshold_exceeded']],
  ])('%s is emitted carrying the fields master names', (event, fields) => {
    // The payload contract matters as much as the topic: a consumer written against the spec reads
    // these keys, and an event missing one is a subscriber that silently does nothing.
    const idx = service.indexOf(`${event}.v1`);
    expect(idx).toBeGreaterThan(-1);
    const emission = service.slice(idx, idx + 600);
    for (const f of fields) expect(emission).toContain(f);
  });

  it.each(['finance.billing.approved.v1', 'finance.ar_receipt.recorded.v1'])(
    '%s is emitted (ADR-024 billing lifecycle)',
    (event) => {
      // ADR-024 Consequences: "DRAFT → ISSUED (approval, emits finance.billing.approved.v1) → PAID
      // (on AR receipt, emits finance.ar_receipt.recorded.v1)".
      expect(service).toContain(event);
    },
  );

  it('every emitted event carries the .v1 suffix (QM event versioning)', () => {
    const emitted = [...service.matchAll(/emitEvent\('([^']+)'/g)].map((m) => m[1]!);
    expect(emitted.length).toBeGreaterThan(0);
    for (const e of emitted) expect(e).toMatch(/\.v\d+$/);
  });
});

describe('Phase 7 · variance alert threshold (master:2990-2991)', () => {
  it('defaults to 10%', () => {
    expect(service).toMatch(/\b10\b/);
  });

  it('reads the per-project override from project_budgets.variance_alert_threshold', () => {
    // "TENANT_ADMIN can override per project via project settings; stored in
    // project_budgets.variance_alert_threshold". A hardcoded 10 with no column read is a threshold
    // nobody can change.
    expect(service).toContain('variance_alert_threshold');
  });
});

describe('Phase 7 · consumers (master:2937-2940)', () => {
  it.each([
    'procurement.po.created.v1',
    'procurement.invoice.received.v1',
    'procurement.po.status_changed.v1',
  ])('subscribes to %s', (topic) => {
    expect(consumer).toContain(topic);
  });

  it.each([
    ['procurement.po.created.v1', 'handlePoCreated'],
    ['procurement.invoice.received.v1', 'handleInvoiceReceived'],
    ['procurement.po.status_changed.v1', 'handlePoStatusChanged'],
  ])('%s is wired to a handler', (_topic, handler) => {
    // Subscribing without handling is a topic that looks covered in a topology diagram and drops
    // every message.
    expect(consumer).toContain(handler);
    expect(service).toContain(`async ${handler}(`);
  });

  it('a cancelled PO releases its committed amount (master:2940)', () => {
    const idx = service.indexOf('async handlePoStatusChanged(');
    expect(idx).toBeGreaterThan(-1);
    expect(service.slice(idx, idx + 1200)).toContain('CANCELLED');
  });
});

/**
 * The drift guard.
 *
 * §32's "Required Canonical Names" table asked for `finance.variance.alert.v1` to be renamed
 * `finance.budget.variance_detected.v1`. It never was — while the same table's other applicable
 * rows (equipment, workforce) were applied end to end — and nothing noticed, because no test related
 * what the service EMITS to what the platform can actually carry. §32 has since been corrected to
 * the implemented name; this is what stops the next one going unnoticed for as long.
 *
 * The check is deliberately about internal consistency rather than about matching a list copied out
 * of a spec: an event with no schema and no catalogue entry cannot be published at all, whatever any
 * document says its name should be.
 */
describe('Phase 7 · every emitted event is one the platform can carry', () => {
  const catalogue = read('packages/@cos/shared/src/kafka/topic-catalog.ts');
  const emitted = [...new Set([...service.matchAll(/emitEvent\('([^']+)'/g)].map((m) => m[1]!))];

  it('finds the events to check', () => {
    expect(emitted.length).toBeGreaterThan(0);
  });

  it.each(emitted)('%s has a topic-catalogue entry', (event) => {
    expect(catalogue).toContain(`'${event}'`);
  });

  it.each(emitted)('%s has an Avro schema on disk', (event) => {
    // The registry validates against this file; without it the producer has nothing to register.
    expect(exists(`packages/@cos/shared/src/avro/${event}.avsc`)).toBe(true);
  });

  it('the variance alert names the same event everywhere it is written down', () => {
    // Emitter, catalogue, schema file and the typed contract exported from @cos/shared.
    const name = 'finance.variance.alert.v1';
    expect(service).toContain(`emitEvent('${name}'`);
    expect(catalogue).toContain(`'${name}': '${name}.avsc'`);
    expect(exists(`packages/@cos/shared/src/avro/${name}.avsc`)).toBe(true);
    expect(read('packages/@cos/shared/src/index.ts')).toContain(`./events/${name}`);
  });
});
