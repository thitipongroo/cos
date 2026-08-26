/**
 * Phase 21 — Equipment Service. CONFORMANCE only.
 *
 * The schema, the enums, the hypertable and its index, RLS, and the status-transition rules are all
 * asserted against a running database by
 * backend/test/phase-21-equipment/01-equipment.integration. Those left this file on
 * 2026-08-25 rather than being kept as text scans of the migration.
 *
 * What remains is the part with three separate declarations that must agree and nothing to run: an
 * Avro payload, an offline-sync entity list the mobile client gates its outbox on, and a set of IoT
 * decisions that are stated as EXCLUSIONS. master:5241-5244 does not merely prefer EMQX — it
 * excludes Azure IoT Hub, defers AWS IoT Core, and rules out EMQX's own Kafka data-bridge because
 * that one is a paid Enterprise feature. A resolved decision with three named alternatives is
 * exactly the kind that gets quietly re-opened by whoever reaches for the familiar SDK.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { exists, read, readYaml, abs } from '../helpers';

const controller = read('backend/src/modules/equipment/equipment.controller.ts');
const stub = read('backend/src/modules/equipment/iot-integration.stub.ts');
const syncTypes = read('packages/@cos/types/src/sync.ts');
const syncService = read('backend/src/modules/sync/sync.service.ts');
const syncAuthz = read('backend/src/modules/sync/sync-authz.ts');

/** Every .ts/.go file in the repo's source trees, for the "nothing anywhere does X" claims. */
const sourceFiles = ((): string[] => {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.venv')
        continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|go)$/.test(entry.name)) out.push(full);
    }
  };
  for (const root of ['backend/src', 'services', 'apps/mobile/src']) walk(abs(root));
  return out;
})();

// ── Absence: the RBAC matrix, stated as who is left OUT ────────────────────

describe('the role gate is present and no wider than the matrix', () => {
  // Equipment row: Executive R | PM RW | Site Engineer R | Procurement R | Finance R | Safety — |
  // CRM — | Tenant Admin FULL. Both controllers shipped with the JWT guard alone and NO @Roles at
  // all, so every write was open to any authenticated tenant user — and every request succeeded,
  // which is why nothing surfaced it.
  it('pairs RolesGuard with JwtAuthGuard on every controller', () => {
    const guards = controller.match(/@UseGuards\([^)]*\)/g) ?? [];
    expect(guards.length).toBeGreaterThan(0);
    expect(guards.filter((g) => !g.includes('RolesGuard'))).toEqual([]);
  });

  it('gates every write route, with no route left undecorated', () => {
    // @Roles is SetMetadata — inert without the guard, which is why the pair is asserted together.
    // Enumerated route by route: a new write route added without the decorator is the failure, and
    // it cannot be seen by exercising the routes that DO have it.
    expect(controller).toMatch(
      /EQUIPMENT_WRITE_ROLES = \[CosRole\.PROJECT_MANAGER, CosRole\.TENANT_ADMIN\]/,
    );
    for (const route of [
      '@Post()',
      "@Patch(':id/status')",
      "@Post(':id/assignments')",
      "@Patch(':id/assignments/:aid/return')",
      "@Post(':id/maintenance')",
      "@Post(':id/utilization')",
    ]) {
      const after = controller.slice(
        controller.indexOf(route) + route.length,
        controller.indexOf(route) + route.length + 60,
      );
      expect(after).toContain('@Roles(...EQUIPMENT_WRITE_ROLES)');
    }
  });

  it('denies Safety, CRM and Site Worker entirely, reads included', () => {
    // The matrix marks these with an em dash — no access at all. A role that crept into the read set
    // would simply see the data; nothing would fail.
    const readRoles = controller.slice(
      controller.indexOf('EQUIPMENT_READ_ROLES = ['),
      controller.indexOf('] as const;', controller.indexOf('EQUIPMENT_READ_ROLES = [')),
    );
    expect(readRoles).not.toContain('SAFETY_OFFICER');
    expect(readRoles).not.toContain('CRM_SALES_MANAGER');
    expect(readRoles).not.toContain('SITE_WORKER');
    // The control: the exclusions above must come from the matrix, not from an empty list.
    expect(readRoles).toContain('EXECUTIVE');
    expect(readRoles).toContain('FINANCE');
  });
});

// ── Cross-source: the event payloads ───────────────────────────────────────

describe('every equipment event carries exactly the payload the spec names (master:5221-5225)', () => {
  const catalog = read('packages/@cos/shared/src/kafka/topic-catalog.ts');
  const payloadOf = (event: string): string[] => {
    const schema = JSON.parse(read(`packages/@cos/shared/src/avro/${event}.avsc`)) as {
      fields: Array<{ name: string; type: { fields?: Array<{ name: string }> } }>;
    };
    return (schema.fields.find((f) => f.name === 'payload')?.type.fields ?? []).map((f) => f.name);
  };

  it.each([
    ['equipment.unit.assigned.v1', ['equipment_id', 'project_id', 'assigned_by']],
    ['equipment.unit.returned.v1', ['equipment_id', 'project_id']],
    ['equipment.unit.maintenance_scheduled.v1', ['equipment_id', 'scheduled_at']],
  ])('%s: catalogue entry and schema payload agree', (event, fields) => {
    expect(catalog).toContain(`'${event}'`);
    expect(payloadOf(event)).toEqual(fields);
  });
});

// ── Cross-source: the contract document versus the controller ──────────────

describe('the OpenAPI document describes the routes that exist (master:5219)', () => {
  it('documents all nine operations', () => {
    const doc = readYaml<{ openapi: string; paths: Record<string, Record<string, unknown>> }>(
      'docs/api/equipment.openapi.yaml',
    );
    expect(doc.openapi).toMatch(/^3\.1/);
    const expected: Array<[string, string]> = [
      ['/equipment', 'post'],
      ['/equipment', 'get'],
      ['/equipment/{id}', 'get'],
      ['/equipment/{id}/status', 'patch'],
      ['/equipment/{id}/assignments', 'post'],
      ['/equipment/{id}/assignments/{aid}/return', 'patch'],
      ['/equipment/{id}/maintenance', 'post'],
      ['/equipment/{id}/utilization', 'post'],
      ['/projects/{projectId}/equipment', 'get'],
    ];
    expect(expected.filter(([p, m]) => !doc.paths[p] || !doc.paths[p][m])).toEqual([]);
  });
});

// ── Absence: the IoT decisions, stated as exclusions ───────────────────────

describe('the IoT platform decision holds (master:5227-5244)', () => {
  it('has no Azure IoT Hub or AWS IoT Core client anywhere', () => {
    // master:5244 — "Azure IoT Hub excluded; AWS IoT Core deferred". Matched on IMPORTS, not on
    // mentions: the resolution itself is written down in comments that name both, and a scan that
    // caught those would match the record of the decision rather than a violation of it.
    const offenders = sourceFiles.filter((f) =>
      /(?:from\s+['"]|require\(\s*['"]|")(?:@azure\/iot|aws-sdk\/client-iot|azure-iothub)/.test(
        fs.readFileSync(f, 'utf8'),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('reaches Kafka through the custom worker, not an EMQX data-bridge', () => {
    // master:5242-5243 rules the bridge out because it is a paid Enterprise feature — a decision
    // about COST, which is exactly the kind that erodes when someone finds the config easier than
    // the code. Nothing at runtime distinguishes the two paths.
    expect(exists('services/iot-ingestion-worker/internal/ingest/transform.go')).toBe(true);
    const bridgeUsers = sourceFiles.filter((f) =>
      /emqx.*data.?bridge|data.?bridge.*emqx/i.test(fs.readFileSync(f, 'utf8')),
    );
    expect(bridgeUsers).toEqual([]);
  });

  it('puts the tenant in the MQTT topic, never in the payload', () => {
    // master:5199 / §33.5, corrected 2026-08-25. The tenant is a topic segment the broker
    // authenticates per device. A payload field would be forgeable by any device that can publish.
    const transform = read('services/iot-ingestion-worker/internal/ingest/transform.go');
    expect(transform).toContain('cos/v1/tenants/{tenant_id}/devices/{device_id}/telemetry');
  });

  it('keeps the stub interface at the signature the spec gives', () => {
    // An AsyncIterable is what makes this a stream rather than a poll; the shape is the contract the
    // eventual vendor adapter has to satisfy.
    expect(stub).toMatch(
      /streamTelemetry\(\s*equipmentId: string,\s*tenantId: string,?\s*\): AsyncIterable<TelemetryEvent>/,
    );
    for (const field of ['equipmentId', 'timestamp', 'eventType', 'payload']) {
      expect(stub).toContain(field);
    }
  });
});

// ── Cross-source: one entity, four separate declarations ───────────────────

describe('equipment is wired into the offline-sync contract (master:3578, 3582; §17.4, §17.6)', () => {
  it('is on the pushable list AND has a handler behind it', () => {
    // "Equipment usage" is in the §17.4 offline read/write list with sync priority 7. It was the one
    // entry on that list with NO case in SyncService.push, so a device that queued one was told
    // "saved, will sync" and then got 400 forever. The list and the switch are two files, and only
    // reading both together shows the gap.
    expect(syncTypes).toMatch(/^\s*'equipment',$/m);
    expect(syncService).toContain("case 'equipment':");
    expect(syncService).toContain('recordUtilization');
  });

  it('is pullable too — §17.4 says READ/write', () => {
    expect(syncService).toContain("table: 'equipment_telemetry.equipment_utilization'");
  });

  it('carries the same role gate as the REST route it replays', () => {
    // Sync is a second door onto the same write. A looser gate here would be a way around the
    // controller's @Roles without touching the controller.
    expect(syncAuthz).toContain('equipment: EQUIPMENT_WRITE_ROLES');
    expect(syncAuthz).toContain('equipment: EQUIPMENT_READ_ROLES');
    const invariants = syncAuthz.slice(syncAuthz.indexOf('writeNeverWiderThanRead'));
    expect(invariants).toContain("'equipment'");
  });

  it('replays idempotently — a retry must not double-count hours', () => {
    // §17.2 retries a queued mutation up to five times, so a repeated payload is DESIGNED
    // behaviour. hours_operated and fuel_consumed are only ever summed, so an appended duplicate
    // inflates them with nothing to notice. The ON CONFLICT clause and the unique index that backs
    // it live in two files; the clause is inert without the index.
    const repo = read('backend/src/modules/equipment/equipment.repository.ts');
    expect(repo).toContain('ON CONFLICT (tenant_id, equipment_id, recorded_at) DO NOTHING');
    expect(
      read(
        'backend/prisma/migrations/20260825000002_equipment_utilization_idempotent/migration.sql',
      ),
    ).toMatch(/CREATE UNIQUE INDEX[\s\S]*\(tenant_id, equipment_id, recorded_at\)/);
  });
});
