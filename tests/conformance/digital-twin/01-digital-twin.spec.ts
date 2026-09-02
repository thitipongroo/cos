/**
 * Phase 24 — Digital Twin (master:5630-5717).
 *
 * The spec opens by saying what this is NOT: "a digital twin in construction context is NOT a 3D
 * visualization tool — it is a real-time data synchronization layer". Everything that matters here
 * follows from that. The twin reads from source systems over Kafka and never writes back to them,
 * every inferred state carries a confidence, and the whole layer must not block Phases 15–19.
 *
 * The subscription pattern gets its own test because it is where this phase was broken: the consumer
 * matched a topic name that this platform never creates, so the twin received no telemetry at all
 * and state synchronisation — capability 1 — had never run once.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { exists, read, readYaml, abs } from '../helpers';

const TWIN = 'services/ai-gateway/digital_twin';
const kafkaHandler = read(`${TWIN}/kafka_handler.py`);
const router = read(`${TWIN}/router.py`);
const syncService = read(`${TWIN}/sync_service.py`);
const models = read(`${TWIN}/models.py`);
const divergence = read(`${TWIN}/divergence.py`);

// ── 1. Data model ───────────────────────────────────────────────────────────

// The data model — five entity types, three state sources, every TwinEntity column — was asserted
// here by reading the migration as text. backend/test/digital-twin/01-twin-schema
// .integration now asks the DEPLOYED database instead: the enum labels come from pg_enum, the
// hypertable from timescaledb_information (which shows create_hypertable SUCCEEDED, not merely that
// the migration calls it), and the mandatory confidence from an INSERT that is REFUSED. All three
// are strictly stronger, so the scans went (2026-08-25).

describe('Phase 24 · twin_states (master:5693, 5711)', () => {
  it('computes a confidence for every state it writes', () => {
    expect(syncService).toMatch(/def compute_confidence/);
  });
});

// ── 6. The subscription that was broken ─────────────────────────────────────

describe('Phase 24 · telemetry subscription (master:5697)', () => {
  const pattern = ((): RegExp => {
    const line = /_TELEMETRY_TOPIC_PATTERN = r"([^"]+)"/.exec(kafkaHandler);
    expect(line).not.toBeNull();
    return new RegExp(line![1]);
  })();

  it('matches the topic the IoT worker actually publishes', () => {
    // services/iot-ingestion-worker KafkaTopicFor() builds `{tenant_id}.equipment.telemetry.
    // location.v1`, pinned by its own Go test. The pattern here was `^equipment\.telemetry\.` —
    // anchored with no tenant segment — so it could never match, and the twin received nothing.
    // Same failure as Phase 14's ClickHouse Kafka tables, and just as quiet: the consumer connects,
    // the subscription is valid, and no message ever arrives.
    expect(pattern.test('tenant-a.equipment.telemetry.location.v1')).toBe(true);
  });

  it('is anchored, so a later version is not swallowed', () => {
    // A v2 payload has a different shape; matching it with a v1 handler is worse than not matching.
    expect(pattern.test('tenant-a.equipment.telemetry.location.v2')).toBe(false);
  });

  it('does not match a tenant-less name, which this platform never creates', () => {
    expect(pattern.test('equipment.telemetry.location.v1')).toBe(false);
  });

  it('agrees with the Go producer, not merely with itself', () => {
    // The producer's own test pins the string. Reading it here means the two sides cannot drift
    // without one of them going red.
    const goTest = read('services/iot-ingestion-worker/internal/ingest/transform_test.go');
    const produced = /"([^"]*\.equipment\.telemetry\.[^"]*)"/.exec(goTest);
    expect(produced).not.toBeNull();
    expect(pattern.test(produced![1])).toBe(true);
  });
});

// ── 7. Producers ────────────────────────────────────────────────────────────

describe('Phase 24 · twin events (master:5698)', () => {
  it.each(['twin.state.updated.v1', 'twin.divergence.detected.v1'])(
    'publishes %s and has a schema for it',
    (event) => {
      expect(kafkaHandler).toContain(event);
      expect(exists(`packages/@cos/kafka/src/avro/${event}.avsc`)).toBe(true);
      expect(read('packages/@cos/kafka/src/topic-catalog.ts')).toContain(`'${event}'`);
    },
  );

  it('publishes to the per-tenant topic, the same naming it now consumes', () => {
    // The bug fixed above was an asymmetry inside this one file: the producer built
    // `{tenant_id}.{event_type}` correctly while the consumer did not.
    expect(kafkaHandler).toMatch(/f"\{tenant_id\}\.\{event_type\}"/);
  });
});

// ── 3, 4. Sync and divergence ───────────────────────────────────────────────

describe('Phase 24 · synchronisation and divergence (master:5694-5695)', () => {
  it('has a state synchronisation service', () => {
    expect(exists(`${TWIN}/sync_service.py`)).toBe(true);
    expect(syncService).toMatch(/async def handle_iot_telemetry_event/);
  });

  it('has a divergence engine with per-entity-type thresholds', () => {
    // master:5665 — "Alert when divergence > configured threshold per entity type". One global
    // number would treat a structure and a fuel gauge the same.
    expect(divergence).toMatch(/DEFAULT_THRESHOLDS/);
    for (const entityType of ['STRUCTURE', 'EQUIPMENT']) {
      expect(divergence).toContain(`"${entityType}"`);
    }
    expect(divergence).toMatch(/thresholds: dict\[str, float\] \| None = None/);
  });

  it('reports an unknown plan as UNASSESSED rather than as a divergence', () => {
    // BIM Integration is a Phase 24 PREREQUISITE (master:5639) and is not built, so planned_state is
    // empty for every entity. Comparing a real reading against {} scored everything at gap 1.0 /
    // HIGH — the report flagged the whole site on every run, which is an alert people learn to
    // dismiss, and it asserted divergence from a plan nobody had. Product-owner decision 2026-08-25.
    expect(models).toMatch(/class UnassessedEntity/);
    expect(divergence).toMatch(/if not planned_state:/);
    expect(divergence).toMatch(/unassessed\.append/);
  });
});

// ── 5, 8, 14. Query API ─────────────────────────────────────────────────────

describe('Phase 24 · query API (master:5671-5674, 5696, 5699)', () => {
  it('is FastAPI on the ai-gateway service', () => {
    // master:5696 — "Twin query API (FastAPI — ai-gateway service, Python for ML integration)".
    expect(router).toMatch(/from fastapi import|APIRouter/);
  });

  it('exposes getTwinState and getDivergenceReport', () => {
    expect(router).toMatch(/projects\/\{project_id\}\/state/);
    expect(router).toMatch(/projects\/\{project_id\}\/divergence/);
  });

  it('exposes subscribeToStateChanges, the third method the spec names', () => {
    // master:5674 lists three query methods and this one had no implementation at all. Product-owner
    // decision 2026-08-25: SSE, because the signature is an AsyncIterable — one-way — and a one-way
    // stream rides the existing L7 path with no upgrade handshake or sticky sessions. Nothing in
    // this platform speaks WebSocket, and §19.2 forbids it for notifications.
    expect(router).toMatch(/projects\/\{project_id\}\/state\/stream/);
    expect(router).toMatch(/media_type="text\/event-stream"/);
    expect(router).toMatch(/async def subscribe_to_state_changes/);
  });

  it('feeds the stream from the ONE Kafka consumer, not one per connection', () => {
    // A consumer per HTTP connection would create a consumer group per browser tab and rebalance
    // the telemetry topic on every page load.
    expect(read(`${TWIN}/kafka_handler.py`)).toMatch(/state_stream\.publish\(/);
    expect(exists(`${TWIN}/state_stream.py`)).toBe(true);
  });

  it('keys the fan-out by tenant AND project', () => {
    // Same project id under two tenants must not cross. This is the one failure here that would be
    // a breach rather than a bug.
    const stream = read(`${TWIN}/state_stream.py`);
    expect(stream).toMatch(/_subscribers\.get\(\(str\(tenant_id\), str\(project_id\)\)\)/);
    expect(stream).toMatch(/_QUEUE_MAXSIZE/);
  });

  it('documents every route in an OpenAPI 3.1 contract', () => {
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

// ── The event the stream carries ────────────────────────────────────────────

describe('Phase 24 · twin.state.updated carries the right project', () => {
  it('emits the ENTITY project, not the entity id repeated', () => {
    // The payload field read `str(twin_state.entity_id)` while the comment above it said project_id
    // "resolves via the entity lookup in sync_service" — and TwinState had no project_id to resolve
    // into. Every consumer filtering by project matched nothing, the SSE stream included.
    expect(kafkaHandler).toMatch(/"project_id": str\(twin_state\.project_id\)/);
    expect(models).toMatch(/class TwinState\(BaseModel\):[\s\S]{0,400}project_id: UUID/);
    expect(syncService).toMatch(/SELECT entity_id, project_id/);
  });
});

// ── 13. Read-optimised ──────────────────────────────────────────────────────

describe('Phase 24 · the twin is read-optimised (master:5708-5709)', () => {
  it('NEGATIVE — no HTTP route writes twin STATE', () => {
    // "All writes come from source systems (IoT, inspection, schedule) via Kafka." The one POST
    // registers an ENTITY — device provisioning / BIM element import, i.e. configuration — which is
    // not operational data. A route that inserted into twin_states would make the twin a system of
    // record it is explicitly not.
    expect(router).not.toMatch(/INSERT INTO digital_twin\.twin_states/);
    const writeRoutes = [
      ...router.matchAll(/@router\.(post|put|patch|delete)\(\s*\n?\s*"([^"]+)"/g),
    ];
    expect(writeRoutes.map((m) => m[2])).toEqual(['/projects/{project_id}/entities']);
  });

  it('writes state only from the Kafka consumer path', () => {
    expect(syncService).toMatch(/INSERT INTO digital_twin\.twin_states/);
  });
});

// ── 15. Cache ───────────────────────────────────────────────────────────────

describe('Phase 24 · cache (master:5689)', () => {
  it('caches current state in Redis for five minutes', () => {
    expect(syncService).toMatch(/_REDIS_TTL_SECS = 300/);
  });
});

// ── 9, 10. Tests the phase itself must have ─────────────────────────────────

describe('Phase 24 · its own tests (master:5700-5701)', () => {
  it('covers divergence calculation and state merge', () => {
    expect(exists(`${TWIN}/tests/test_divergence.py`)).toBe(true);
    expect(exists(`${TWIN}/tests/test_sync_service_integration.py`)).toBe(true);
  });

  it('runs the IoT event through the sync service before asserting divergence', () => {
    // master:5701 asks for "end-to-end IoT event → twin state → divergence alert". The class that
    // claimed it called only generate_divergence_report and asserted `divergences` was a list —
    // true whatever the engine did, and reached by no IoT event at all.
    const e2e = read(`${TWIN}/tests/test_twin_integration.py`);
    const block = e2e.slice(e2e.indexOf('class TestEndToEndTwinFlow'));
    expect(block).toMatch(/handle_iot_telemetry_event\(/);
    expect(block).toMatch(/generate_divergence_report\(/);
  });
});

// ── 11. Carbon analytics ────────────────────────────────────────────────────

describe('Phase 24 · carbon analytics module (master:5702-5704)', () => {
  const carbon = read('services/analytics-worker/internal/carbon/consumer.go');

  it('consumes carbon.record.created.v1 from the tenant-scoped topic', () => {
    expect(carbon).toContain('carbon.record.created.v1');
    // The same tenant-prefix rule the telemetry consumer got wrong.
    expect(carbon).toMatch(/\^\[\^\.\]\+\\\./);
  });

  it('classifies embodied material carbon as GHG Protocol Scope 3', () => {
    // §33.4 — embodied carbon in materials (EN 15804 modules A1–A3) is Scope 3, not Scope 1 or 2.
    // Getting the scope wrong misstates a number that goes into external reporting.
    expect(carbon).toMatch(/scopeEmbodiedMaterials\s*=\s*"SCOPE_3"/);
  });

  it('carries carbon_kgco2e as a string, never a float', () => {
    // Same rule as money (master:990): a quantity that feeds a reported total does not cross a
    // service boundary as a float.
    expect(carbon).toMatch(/CarbonKgco2e\s+string/);
  });
});

// ── 16. Storage placement ───────────────────────────────────────────────────

// ── The tiering the spec asks for and never defines ────────────────────────

describe('Phase 24 · synchronisation is untiered, and the spec cannot say otherwise (master:5661)', () => {
  it('NEGATIVE — nothing implements the 15-minute batch tier, because "critical asset" has no definition', () => {
    // master:5661: "Frequency: real-time for critical assets, batch 15min for others". The whole
    // system is real-time: every telemetry record is written through the Kafka consumer as it
    // arrives, and there is no second, slower path.
    //
    // It is NOT stubbed, and that is the decision rather than an oversight. `critical asset` occurs
    // exactly once in the entire specification — in master:5661 itself — with no definition of what
    // makes an asset critical, which is the UNSPECIFIED case: information absent from ALL spec files
    // and context files. Picking a tier axis here (EntityType? equipment_type? a flag?) would be
    // inventing the requirement, and every entity would then be sorted by a rule the product owner
    // never wrote. Product-owner decision 2026-08-29: record it, do not implement it.
    //
    // §33 also has an unsatisfied gate ahead of this: "IoT message throughput budget — device count
    // × sensor sampling rate", listed among the outputs that must exist BEFORE Phase 24 begins. Until
    // that number exists there is no evidence that real-time for everything is too expensive, which
    // is the only reason to want the batch tier at all.
    //
    // Written as an absence so it fails the day someone builds the tier — at which point this test
    // is deleted and replaced by one asserting the schedule.
    const twinSources = ['sync_service.py', 'kafka_handler.py', 'divergence.py', 'router.py'].map(
      (f) => read(`${TWIN}/${f}`),
    );
    for (const src of twinSources) {
      const code = src
        .split('\n')
        .filter((l) => !l.trimStart().startsWith('#'))
        .join('\n');
      // No scheduler, no batch window, no 15-minute interval anywhere on the twin write path.
      expect(code).not.toMatch(/\b(900|15\s*\*\s*60)\b/);
      expect(code).not.toMatch(/critical[_\s]?asset/i);
    }
  });

  it('CONTROL — the definition really is absent from the specification, not merely from the code', () => {
    // If "critical asset" were defined somewhere, the absence above would be a gap to close rather
    // than a question to escalate. This is what makes it UNSPECIFIED, and it is asserted so that the
    // day someone writes the definition, this fails and the escalation is answered.
    const specs: Array<[string, string]> = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(abs(dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (/\.md$/.test(entry.name)) specs.push([rel, fs.readFileSync(abs(rel), 'utf8')]);
      }
    };
    for (const root of ['docs/specifications', 'context']) walk(root);
    const mentions = specs.filter(([, body]) => /critical\s+asset/i.test(body)).map(([f]) => f);
    // The single mention moved with Phase 24's command block when the Phase blocks left the master
    // on 2026-09-02 (f55dee77). Still exactly one file, still no definition in it — which is what
    // this control asserts. The walk covers `context/` recursively, so it finds the new location on
    // its own; only the expected path had to change.
    expect(mentions).toEqual(['context/phases/phase-24-digital-twin.md']);
  });
});

// ── The two twin events nobody listens to ───────────────────────────────────
//
// This is the same shape of gap master:5496-5506 records for construction.delay.detected.v1 — a
// schema, a topic-catalogue entry and documented consumers, with nothing on one end — except
// mirrored: here the PRODUCER is finished and the consumers are the missing half. Product-owner
// decision 2026-08-29: record the gap and guard it rather than build the consumers now.

describe('Phase 24 · twin events are produced into an empty room (master:5660, 5688)', () => {
  // Every Go and TypeScript source that could plausibly hold a consumer. Read from disk rather than
  // listed by hand so a new worker directory cannot quietly become a blind spot.
  const consumerSources = ((): string[] => {
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.venv')
          continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|go)$/.test(entry.name) && !/\.(spec|test)\.ts$|_test\.go$/.test(entry.name))
          out.push(full);
      }
    };
    for (const root of ['services/kg-ingestion-worker', 'services/analytics-worker', 'backend/src'])
      walk(abs(root));
    return out;
  })();

  const subscribers = (event: string): string[] =>
    consumerSources.filter((f) => fs.readFileSync(f, 'utf8').includes(event));

  it('has a finished producer for both, so only the listening half is missing', () => {
    // CONTROL for the two assertions below: they are absences, and an absence proves nothing unless
    // the thing is real. Both events have a schema, a catalogue entry and a producer that sends.
    for (const event of ['twin.state.updated.v1', 'twin.divergence.detected.v1']) {
      expect(exists(`packages/@cos/kafka/src/avro/${event}.avsc`)).toBe(true);
      expect(read('packages/@cos/kafka/src/topic-catalog.ts')).toContain(event);
      expect(kafkaHandler).toContain(event);
    }
    expect(consumerSources.length).toBeGreaterThan(100);
  });

  it('NEGATIVE — master:5660 ends the chain at a Knowledge Graph node update that no worker performs', () => {
    // "IoT telemetry → TwinState update → Knowledge Graph node update". The first two arrows exist.
    // The third does not: kg-ingestion-worker has never heard of the twin, so the graph carries no
    // twin state and §Phase 13's graph queries cannot see the physical site at all.
    //
    // Written as an absence ON PURPOSE. When someone builds the mapper this test FAILS, and the
    // failure is the instruction: delete it, and assert the wiring in its place.
    expect(subscribers('twin.state.updated.v1')).toEqual([]);
  });

  it('NEGATIVE — master:5688 names Analytics as a consumer and analytics-worker does not subscribe', () => {
    // The topic line reads "twin.state.updated (consumers: AI Gateway, Analytics)". AI Gateway is
    // the PRODUCER; its SSE fan-out is in-process (state_stream.py) and never reads the topic back.
    // So neither named consumer exists, and twin.divergence.detected has no listener either — a
    // divergence alert is published and lands nowhere.
    expect(subscribers('twin.divergence.detected.v1')).toEqual([]);
    expect(read(`${TWIN}/state_stream.py`)).not.toContain('twin.state.updated.v1');
  });
});

describe('Phase 24 · storage placement (master:5684-5686; ADR-032)', () => {
  it('keeps twin states on the primary PostgreSQL instance', () => {
    // "co-located on primary PostgreSQL instance through Stages 1–3, split to dedicated instance
    // only on volume trigger; same instance as Phase 21/22". The migration living in the backend's
    // own prisma/migrations IS that co-location — a separate instance would need its own migration
    // root and its own connection string.
    expect(exists('backend/prisma/migrations/20260608000007_digital_twin/migration.sql')).toBe(
      true,
    );
    const sourceFiles = ((): string[] => {
      const out: string[] = [];
      const walk = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (['__pycache__', '.venv', 'node_modules'].includes(entry.name)) continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (/\.py$/.test(entry.name)) out.push(full);
        }
      };
      walk(abs(TWIN));
      return out;
    })();
    // No separate twin database URL anywhere in the module.
    const separate = sourceFiles.filter((f) =>
      /TWIN_DATABASE_URL|TWIN_DB_HOST/.test(fs.readFileSync(f, 'utf8')),
    );
    expect(separate).toEqual([]);
  });
});
