/**
 * Phase 24 — Digital Twin. CONFORMANCE only.
 *
 * What used to live here also asserted the schema (five entity types, three state sources, the
 * hypertable, confidence NOT NULL) by reading the migration as text. All of that is now proven
 * behaviourally by backend/test/spec-derived/phase-24-digital-twin/01-twin-schema.integration —
 * against the DEPLOYED database, which is strictly stronger: it shows `create_hypertable` SUCCEEDED
 * rather than merely that the migration calls it, and it shows a state row with no confidence is
 * REFUSED rather than that the column says NOT NULL. Those assertions were removed on 2026-08-25
 * rather than kept in duplicate.
 *
 * What is left is what no running test can reach: agreements between artifacts that are never
 * loaded in the same process, and rules of the form "this must not exist".
 */
import { read, exists, readYaml } from '../helpers';

const TWIN = 'services/ai-gateway/digital_twin';
const kafkaHandler = read(`${TWIN}/kafka_handler.py`);
const router = read(`${TWIN}/router.py`);
const syncService = read(`${TWIN}/sync_service.py`);
const models = read(`${TWIN}/models.py`);

// ── Cross-source: the topic name, across three languages ────────────────────

describe('the telemetry subscription agrees with the producer (master:5633)', () => {
  const pattern = ((): RegExp => {
    const line = /_TELEMETRY_TOPIC_PATTERN = r"([^"]+)"/.exec(kafkaHandler);
    expect(line).not.toBeNull();
    return new RegExp(line![1]);
  })();

  it('matches the topic the Go IoT worker actually builds', () => {
    // The one assertion in this repo that spans Python and Go. The producer's own test pins the
    // string it emits; reading it here means the two sides cannot drift without one going red.
    // They HAD drifted: the pattern was `^equipment\.telemetry\.`, anchored with no tenant segment,
    // so it could never match a name this platform creates and the twin received nothing at all.
    // Nothing else would have caught it — the consumer connects, the subscription is valid, and the
    // silence looks exactly like "no data yet".
    const goTest = read('services/iot-ingestion-worker/internal/ingest/transform_test.go');
    const produced = /"([^"]*\.equipment\.telemetry\.[^"]*)"/.exec(goTest);
    expect(produced).not.toBeNull();
    expect(pattern.test(produced![1])).toBe(true);
  });

  it('does NOT match a later version', () => {
    // A v2 payload has a different shape. Handling it with a v1 handler is worse than not matching:
    // absence is visible, a silent mis-parse is not.
    expect(pattern.test('tenant-a.equipment.telemetry.location.v2')).toBe(false);
  });

  it('does NOT match a tenant-less name', () => {
    // §7.3 topics are `{tenant_id}.{event_type}`. A pattern that also accepted a bare name would
    // pass against a topic nobody creates, which is how the original bug read as correct.
    expect(pattern.test('equipment.telemetry.location.v1')).toBe(false);
  });

  it('publishes on the same naming it consumes', () => {
    // The original defect was an asymmetry INSIDE this one file: the producer built
    // `{tenant_id}.{event_type}` correctly while the consumer did not. Both halves are asserted so
    // fixing one without the other cannot pass.
    expect(kafkaHandler).toMatch(/f"\{tenant_id\}\.\{event_type\}"/);
  });
});

// ── Cross-source: an event is only real if three artifacts agree ────────────

describe('every twin event is declared everywhere it has to be (master:5634)', () => {
  it.each(['twin.state.updated.v1', 'twin.divergence.detected.v1'])(
    '%s: publisher, Avro schema and topic catalogue all name it',
    (event) => {
      // A publisher naming an event with no schema cannot encode; a schema with no catalogue entry
      // gets no topic. Each artifact looks complete on its own — the failure only appears where two
      // of them meet, which is never in one process.
      expect(kafkaHandler).toContain(event);
      expect(exists(`packages/@cos/shared/src/avro/${event}.avsc`)).toBe(true);
      expect(read('packages/@cos/shared/src/kafka/topic-catalog.ts')).toContain(`'${event}'`);
    },
  );

  it('the state event carries a project_id that its model and its query both provide', () => {
    // Three sources that must agree: the payload built in the handler, the field on the model it
    // reads from, and the SELECT that populates it. The payload used to read
    // `str(twin_state.entity_id)` while TwinState had no project_id at all — so every consumer
    // filtering by project matched nothing, the SSE stream included.
    expect(kafkaHandler).toMatch(/"project_id": str\(twin_state\.project_id\)/);
    expect(models).toMatch(/class TwinState\(BaseModel\):[\s\S]{0,400}project_id: UUID/);
    expect(syncService).toMatch(/SELECT entity_id, project_id/);
  });
});

// ── Cross-source: the contract document versus the routes ───────────────────

describe('the OpenAPI document describes the routes that exist (master:5632, 5635)', () => {
  it('documents every route the router serves', () => {
    // The document and the router are separate files that no test loads together. A route added
    // without its entry is undocumented; an entry without its route is a promise to a client that
    // will 404.
    const doc = readYaml<{ openapi: string; paths: Record<string, Record<string, unknown>> }>(
      'docs/api/digital-twin.openapi.yaml',
    );
    expect(doc.openapi).toMatch(/^3\.1/);
    const expected: Array<[string, string]> = [
      ['/projects/{projectId}/state', 'get'],
      ['/projects/{projectId}/state/stream', 'get'],
      ['/projects/{projectId}/divergence', 'get'],
      ['/projects/{projectId}/entities', 'get'],
      ['/projects/{projectId}/entities', 'post'],
    ];
    expect(expected.filter(([p, m]) => !doc.paths[p] || !doc.paths[p][m])).toEqual([]);
  });
});

// ── Absence: the twin is read-optimised ─────────────────────────────────────

describe('nothing writes twin STATE over HTTP (master:5644-5645)', () => {
  it('exposes exactly one write route, and it registers an entity', () => {
    // "All writes come from source systems (IoT, inspection, schedule) via Kafka." The single POST
    // registers an ENTITY — device provisioning / BIM import, i.e. configuration. A route that
    // inserted into twin_states would make the twin a system of record it is explicitly not.
    //
    // Asserted as an EXHAUSTIVE list rather than a spot check: a new write route added later must
    // fail this, and a passing runtime test can never show that a forbidden route is absent.
    expect(router).not.toMatch(/INSERT INTO digital_twin\.twin_states/);
    const writeRoutes = [
      ...router.matchAll(/@router\.(post|put|patch|delete)\(\s*\n?\s*"([^"]+)"/g),
    ];
    expect(writeRoutes.map((m) => m[2])).toEqual(['/projects/{project_id}/entities']);
  });

  it('the one path that does write state is the Kafka consumer', () => {
    // The control for the rule above: state IS written, just not from a request.
    expect(syncService).toMatch(/INSERT INTO digital_twin\.twin_states/);
  });

  it('the SSE fan-out is keyed by tenant AND project', () => {
    // The one failure here that would be a breach rather than a bug: the same project id under two
    // tenants must not share a subscriber bucket. Nothing boots this stream in a test, and a
    // single-key version would look correct for a single tenant.
    const stream = read(`${TWIN}/state_stream.py`);
    expect(stream).toMatch(/_subscribers\.get\(\(str\(tenant_id\), str\(project_id\)\)\)/);
    expect(stream).toMatch(/_QUEUE_MAXSIZE/);
  });
});

// ── Absence + cross-service: carbon analytics ───────────────────────────────

describe('carbon analytics obeys the platform-wide rules (master:5638-5640)', () => {
  const carbon = read('services/analytics-worker/internal/carbon/consumer.go');

  it('subscribes with the tenant prefix, like every other consumer', () => {
    // The §7.3 rule the telemetry consumer above got wrong, checked on the Go service too. No
    // integration test in this repo boots analytics-worker, so a tenant-less pattern here would
    // read as "no carbon records yet" for as long as anyone cared to look.
    expect(carbon).toContain('carbon.record.created.v1');
    expect(carbon).toMatch(/\^\[\^\.\]\+\\\./);
  });

  it('carries carbon_kgco2e as a string, never a float', () => {
    // Same rule as money (master:990). A quantity that feeds an externally reported total does not
    // cross a service boundary as a float, and a Go struct tag is not something any running test
    // in this repo observes.
    expect(carbon).toMatch(/CarbonKgco2e\s+string/);
    expect(carbon).not.toMatch(/CarbonKgco2e\s+float/);
  });
});
