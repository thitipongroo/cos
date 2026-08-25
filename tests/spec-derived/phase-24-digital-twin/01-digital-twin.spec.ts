/**
 * Phase 24 — Digital Twin (master:5566-5653).
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
const migration = read('backend/prisma/migrations/20260608000007_digital_twin/migration.sql');
const kafkaHandler = read(`${TWIN}/kafka_handler.py`);
const router = read(`${TWIN}/router.py`);
const syncService = read(`${TWIN}/sync_service.py`);
const models = read(`${TWIN}/models.py`);
const divergence = read(`${TWIN}/divergence.py`);

// ── 1. Data model ───────────────────────────────────────────────────────────

describe('Phase 24 · twin data model (master:5586-5592)', () => {
  it('enumerates the five entity types exactly', () => {
    const block = migration.slice(
      migration.indexOf('CREATE TYPE digital_twin.entity_type_enum'),
      migration.indexOf(');', migration.indexOf('CREATE TYPE digital_twin.entity_type_enum')),
    );
    for (const symbol of [
      'STRUCTURE',
      'EQUIPMENT',
      'MATERIAL_STOCK',
      'WORKFORCE_ZONE',
      'INSPECTION_ZONE',
    ]) {
      expect(block).toContain(`'${symbol}'`);
    }
  });

  it('enumerates the three state sources exactly', () => {
    const block = migration.slice(
      migration.indexOf('CREATE TYPE digital_twin.state_source_enum'),
      migration.indexOf(');', migration.indexOf('CREATE TYPE digital_twin.state_source_enum')),
    );
    for (const symbol of ['IOT', 'MANUAL', 'AI_INFERRED']) {
      expect(block).toContain(`'${symbol}'`);
    }
  });

  it('carries every TwinEntity field the spec names', () => {
    const table = migration.slice(
      migration.indexOf('CREATE TABLE digital_twin.twin_entities'),
      migration.indexOf(');', migration.indexOf('CREATE TABLE digital_twin.twin_entities')),
    );
    for (const column of [
      'entity_id',
      'tenant_id',
      'project_id',
      'entity_type',
      'physical_ref',
      'digital_ref',
      'last_synced_at',
      'confidence',
    ]) {
      expect(table).toContain(column);
    }
  });
});

// ── 2, 12. Hypertable and the confidence rule ───────────────────────────────

describe('Phase 24 · twin_states (master:5629, 5647)', () => {
  it('is a hypertable partitioned by recorded_at', () => {
    expect(migration).toMatch(/create_hypertable\(\s*'digital_twin\.twin_states',\s*'recorded_at'/);
  });

  it('makes confidence MANDATORY on every state row', () => {
    // master:5647 — "Confidence score mandatory on every inferred state". Nullable would let an
    // AI_INFERRED row claim the same standing as an IoT reading with nothing to say how sure it is.
    const table = migration.slice(
      migration.indexOf('CREATE TABLE digital_twin.twin_states'),
      migration.indexOf(');', migration.indexOf('CREATE TABLE digital_twin.twin_states')),
    );
    expect(table).toMatch(/confidence\s+DECIMAL\(4,3\)\s+NOT NULL/);
    expect(table).toMatch(/source\s+digital_twin\.state_source_enum\s+NOT NULL/);
  });

  it('computes a confidence for every state it writes', () => {
    expect(syncService).toMatch(/def compute_confidence/);
  });
});

// ── 6. The subscription that was broken ─────────────────────────────────────

describe('Phase 24 · telemetry subscription (master:5633)', () => {
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

describe('Phase 24 · twin events (master:5634)', () => {
  it.each(['twin.state.updated.v1', 'twin.divergence.detected.v1'])(
    'publishes %s and has a schema for it',
    (event) => {
      expect(kafkaHandler).toContain(event);
      expect(exists(`packages/@cos/shared/src/avro/${event}.avsc`)).toBe(true);
      expect(read('packages/@cos/shared/src/kafka/topic-catalog.ts')).toContain(`'${event}'`);
    },
  );

  it('publishes to the per-tenant topic, the same naming it now consumes', () => {
    // The bug fixed above was an asymmetry inside this one file: the producer built
    // `{tenant_id}.{event_type}` correctly while the consumer did not.
    expect(kafkaHandler).toMatch(/f"\{tenant_id\}\.\{event_type\}"/);
  });
});

// ── 3, 4. Sync and divergence ───────────────────────────────────────────────

describe('Phase 24 · synchronisation and divergence (master:5630-5631)', () => {
  it('has a state synchronisation service', () => {
    expect(exists(`${TWIN}/sync_service.py`)).toBe(true);
    expect(syncService).toMatch(/async def handle_iot_telemetry_event/);
  });

  it('has a divergence engine with per-entity-type thresholds', () => {
    // master:5601 — "Alert when divergence > configured threshold per entity type". One global
    // number would treat a structure and a fuel gauge the same.
    expect(divergence).toMatch(/DEFAULT_THRESHOLDS/);
    for (const entityType of ['STRUCTURE', 'EQUIPMENT']) {
      expect(divergence).toContain(`"${entityType}"`);
    }
    expect(divergence).toMatch(/thresholds: dict\[str, float\] \| None = None/);
  });

  it('reports an unknown plan as UNASSESSED rather than as a divergence', () => {
    // BIM Integration is a Phase 24 PREREQUISITE (master:5575) and is not built, so planned_state is
    // empty for every entity. Comparing a real reading against {} scored everything at gap 1.0 /
    // HIGH — the report flagged the whole site on every run, which is an alert people learn to
    // dismiss, and it asserted divergence from a plan nobody had. Product-owner decision 2026-08-25.
    expect(models).toMatch(/class UnassessedEntity/);
    expect(divergence).toMatch(/if not planned_state:/);
    expect(divergence).toMatch(/unassessed\.append/);
  });
});

// ── 5, 8, 14. Query API ─────────────────────────────────────────────────────

describe('Phase 24 · query API (master:5607-5610, 5632, 5635)', () => {
  it('is FastAPI on the ai-gateway service', () => {
    // master:5632 — "Twin query API (FastAPI — ai-gateway service, Python for ML integration)".
    expect(router).toMatch(/from fastapi import|APIRouter/);
  });

  it('exposes getTwinState and getDivergenceReport', () => {
    expect(router).toMatch(/projects\/\{project_id\}\/state/);
    expect(router).toMatch(/projects\/\{project_id\}\/divergence/);
  });

  it('exposes subscribeToStateChanges, the third method the spec names', () => {
    // master:5610 lists three query methods and this one had no implementation at all. Product-owner
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

describe('Phase 24 · the twin is read-optimised (master:5644-5645)', () => {
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

describe('Phase 24 · cache (master:5625)', () => {
  it('caches current state in Redis for five minutes', () => {
    expect(syncService).toMatch(/_REDIS_TTL_SECS = 300/);
  });
});

// ── 9, 10. Tests the phase itself must have ─────────────────────────────────

describe('Phase 24 · its own tests (master:5636-5637)', () => {
  it('covers divergence calculation and state merge', () => {
    expect(exists(`${TWIN}/tests/test_divergence.py`)).toBe(true);
    expect(exists(`${TWIN}/tests/test_sync_service_integration.py`)).toBe(true);
  });

  it('runs the IoT event through the sync service before asserting divergence', () => {
    // master:5637 asks for "end-to-end IoT event → twin state → divergence alert". The class that
    // claimed it called only generate_divergence_report and asserted `divergences` was a list —
    // true whatever the engine did, and reached by no IoT event at all.
    const e2e = read(`${TWIN}/tests/test_twin_integration.py`);
    const block = e2e.slice(e2e.indexOf('class TestEndToEndTwinFlow'));
    expect(block).toMatch(/handle_iot_telemetry_event\(/);
    expect(block).toMatch(/generate_divergence_report\(/);
  });
});

// ── 11. Carbon analytics ────────────────────────────────────────────────────

describe('Phase 24 · carbon analytics module (master:5638-5640)', () => {
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

describe('Phase 24 · storage placement (master:5620-5622; ADR-032)', () => {
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
