/**
 * Phase 21 — Equipment Service (master:5142-5251).
 *
 * Equipment is where three separate contracts meet: a PostgreSQL schema, a TimescaleDB hypertable,
 * and the offline-sync entity list the mobile client gates its outbox on. Each of them is a
 * declaration that something else has to honour, and this phase's spec pins all three.
 *
 * The IoT items are negative on purpose. master:5241-5244 does not merely prefer EMQX — it excludes
 * Azure IoT Hub, defers AWS IoT Core, and rules out EMQX's own Kafka data-bridge because that one is
 * a paid Enterprise feature. A resolved decision with three named alternatives is exactly the kind
 * that gets quietly re-opened by whoever reaches for the familiar SDK.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { exists, read, readYaml, abs } from '../helpers';

const controller = read('backend/src/modules/equipment/equipment.controller.ts');
const migration = read('backend/prisma/migrations/20260608000005_equipment_service/migration.sql');
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

// ── 1. Module shape ─────────────────────────────────────────────────────────

describe('Phase 21 · module (master:5216)', () => {
  it.each([
    'equipment.module.ts',
    'equipment.service.ts',
    'equipment.repository.ts',
    'equipment.controller.ts',
  ])('has %s', (file) => {
    expect(exists(`backend/src/modules/equipment/${file}`)).toBe(true);
  });
});

// ── 2-4. Entities ───────────────────────────────────────────────────────────

describe('Phase 21 · entities (master:5150-5186)', () => {
  it('enumerates equipment types exactly as the spec lists them', () => {
    expect(migration).toContain(
      `'CRANE', 'EXCAVATOR', 'CONCRETE_MIXER', 'GENERATOR', 'SCAFFOLD', 'VEHICLE', 'OTHER'`,
    );
  });

  it('enumerates equipment statuses exactly as the spec lists them', () => {
    expect(migration).toContain(`'AVAILABLE', 'IN_USE', 'MAINTENANCE', 'RETIRED'`);
  });

  it('keeps an equipment code unique per tenant', () => {
    expect(migration).toContain('UNIQUE (tenant_id, equipment_code)');
  });

  it('stores money as DECIMAL(19,4) with a currency, never a float', () => {
    // master:2234 — every monetary field. purchase_cost and maintenance cost are both money.
    expect(migration).toMatch(/purchase_cost\s+DECIMAL\(19,4\)/);
    expect(migration).toMatch(/cost\s+DECIMAL\(19,4\)/);
    expect(migration).not.toMatch(/purchase_cost\s+(REAL|FLOAT|DOUBLE)/i);
    expect((migration.match(/currency_code\s+VARCHAR\(3\)/g) ?? []).length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it('lets an assignment stay open — returned_at is nullable', () => {
    // An assignment with no return date is the normal state of equipment currently on a project;
    // NOT NULL here would make "assign" impossible without also returning.
    const table = migration.slice(
      migration.indexOf('CREATE TABLE equipment.equipment_assignments'),
      migration.indexOf(');', migration.indexOf('CREATE TABLE equipment.equipment_assignments')),
    );
    expect(table).toMatch(/returned_at\s+TIMESTAMPTZ(?!\s+NOT NULL)/);
    expect(table).toMatch(/equipment_id\s+UUID NOT NULL REFERENCES equipment\.equipment/);
  });

  it('enumerates maintenance types and statuses exactly as the spec lists them', () => {
    expect(migration).toContain(`'SCHEDULED', 'UNSCHEDULED', 'REPAIR'`);
    expect(migration).toContain(`'PENDING', 'IN_PROGRESS', 'COMPLETED'`);
  });
});

// ── 5. Hypertable ───────────────────────────────────────────────────────────

describe('Phase 21 · utilization hypertable (master:5188-5197)', () => {
  it('lives in the equipment_telemetry schema', () => {
    expect(migration).toContain('CREATE SCHEMA IF NOT EXISTS equipment_telemetry');
    expect(migration).toContain('CREATE TABLE equipment_telemetry.equipment_utilization');
  });

  it('is converted to a hypertable partitioned by recorded_at', () => {
    // T1 can only see that the call is MADE. Whether it SUCCEEDS depends on the image shipping
    // TimescaleDB, which is a T2 question — and one Phase 18 already answered the hard way.
    expect(migration).toMatch(
      /create_hypertable\(\s*'equipment_telemetry\.equipment_utilization',\s*'recorded_at'/,
    );
  });

  it('indexes (equipment_id, recorded_at DESC) as the spec names', () => {
    expect(migration).toMatch(
      /ON equipment_telemetry\.equipment_utilization\s*\n?\s*\(equipment_id, recorded_at DESC\)/,
    );
  });
});

// ── 6. API surface ──────────────────────────────────────────────────────────

describe('Phase 21 · API surface (master:5204-5212)', () => {
  const routes: Array<[string, string]> = [
    ['@Post', '()'],
    ['@Get', '()'],
    ['@Get', "(':id')"],
    ['@Patch', "(':id/status')"],
    ['@Post', "(':id/assignments')"],
    ['@Patch', "(':id/assignments/:aid/return')"],
    ['@Post', "(':id/maintenance')"],
    ['@Post', "(':id/utilization')"],
  ];

  it.each(routes)('exposes %s%s', (verb, suffix) => {
    expect(controller).toContain(`${verb}${suffix}`);
  });

  it('exposes the project-scoped listing on its own route', () => {
    expect(controller).toContain(`@Controller('projects/:projectId/equipment')`);
  });

  it('does NOT repeat the global api/v1 prefix', () => {
    // The app sets a global prefix; a controller repeating it serves /api/v1/api/v1/equipment.
    expect(controller).not.toMatch(/@Controller\('api\/v1/);
  });
});

// ── RBAC ────────────────────────────────────────────────────────────────────

describe('Phase 21 · RBAC (06-rbac-permission-matrix §Construction Modules)', () => {
  // Equipment row: Executive R | PM RW | Site Engineer R | Procurement R | Finance R | Safety — |
  // CRM — | Tenant Admin FULL. Both controllers shipped with the JWT guard alone and no @Roles at
  // all, so every write was open to any authenticated tenant user.
  it('pairs RolesGuard with JwtAuthGuard on every controller', () => {
    const guards = controller.match(/@UseGuards\([^)]*\)/g) ?? [];
    expect(guards.length).toBeGreaterThan(0);
    expect(guards.filter((g) => !g.includes('RolesGuard'))).toEqual([]);
  });

  it('restricts writes to Project Manager and Tenant Admin', () => {
    expect(controller).toMatch(
      /EQUIPMENT_WRITE_ROLES = \[CosRole\.PROJECT_MANAGER, CosRole\.TENANT_ADMIN\]/,
    );
  });

  it('gates every write route', () => {
    // @Roles is SetMetadata — inert without RolesGuard, which is why the pair is asserted together.
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

  it('denies Safety and CRM entirely, including reads', () => {
    const readRoles = controller.slice(
      controller.indexOf('EQUIPMENT_READ_ROLES = ['),
      controller.indexOf('] as const;', controller.indexOf('EQUIPMENT_READ_ROLES = [')),
    );
    expect(readRoles).not.toContain('SAFETY_OFFICER');
    expect(readRoles).not.toContain('CRM_SALES_MANAGER');
    expect(readRoles).not.toContain('SITE_WORKER');
    expect(readRoles).toContain('EXECUTIVE');
    expect(readRoles).toContain('FINANCE');
  });
});

// ── 7. OpenAPI ──────────────────────────────────────────────────────────────

describe('Phase 21 · OpenAPI (master:5219)', () => {
  it('documents all nine operations the spec lists', () => {
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

// ── 8. Events ───────────────────────────────────────────────────────────────

describe('Phase 21 · Kafka events (master:5221-5225)', () => {
  const catalog = read('packages/@cos/shared/src/kafka/topic-catalog.ts');
  const payloadOf = (event: string): string[] => {
    const schema = JSON.parse(read(`packages/@cos/shared/src/avro/${event}.avsc`)) as {
      fields: Array<{ name: string; type: { fields?: Array<{ name: string }> } }>;
    };
    const payload = schema.fields.find((f) => f.name === 'payload');
    return (payload?.type.fields ?? []).map((f) => f.name);
  };

  it.each([
    ['equipment.unit.assigned.v1', ['equipment_id', 'project_id', 'assigned_by']],
    ['equipment.unit.returned.v1', ['equipment_id', 'project_id']],
    ['equipment.unit.maintenance_scheduled.v1', ['equipment_id', 'scheduled_at']],
  ])('%s carries exactly the payload the spec names', (event, fields) => {
    expect(catalog).toContain(`'${event}'`);
    expect(payloadOf(event)).toEqual(fields);
  });
});

// ── 9-11. IoT ───────────────────────────────────────────────────────────────

describe('Phase 21 · IoT integration (master:5199, 5227-5244)', () => {
  it('declares the stub interface with the signature the spec gives', () => {
    expect(stub).toMatch(
      /streamTelemetry\(\s*equipmentId: string,\s*tenantId: string,?\s*\): AsyncIterable<TelemetryEvent>/,
    );
  });

  it('shapes TelemetryEvent as the spec names it', () => {
    for (const field of ['equipmentId', 'timestamp', 'eventType', 'payload']) {
      expect(stub).toContain(field);
    }
  });

  it('subscribes to the tenant-scoped telemetry topic', () => {
    // master:5199 / §33.5, corrected 2026-08-25. The tenant is a TOPIC segment the broker
    // authenticates per device — never a payload field, which any device could forge.
    const transform = read('services/iot-ingestion-worker/internal/ingest/transform.go');
    expect(transform).toContain('cos/v1/tenants/{tenant_id}/devices/{device_id}/telemetry');
  });

  it('NEGATIVE — no Azure IoT Hub or AWS IoT Core client anywhere', () => {
    // master:5244: "Azure IoT Hub excluded; AWS IoT Core deferred". Matched on imports, not on
    // mentions — the resolution itself is written down in comments that name both.
    const offenders = sourceFiles.filter((f) =>
      /(?:from\s+['"]|require\(\s*['"]|")(?:@azure\/iot|aws-sdk\/client-iot|azure-iothub)/.test(
        fs.readFileSync(f, 'utf8'),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('NEGATIVE — telemetry reaches Kafka through the custom worker, not an EMQX data-bridge', () => {
    // master:5242-5243 rules the bridge out because it is a paid Enterprise feature — a decision
    // about cost, which is exactly the kind that erodes when someone finds the config easier.
    expect(exists('services/iot-ingestion-worker/internal/ingest/transform.go')).toBe(true);
    const bridgeUsers = sourceFiles.filter((f) =>
      /emqx.*data.?bridge|data.?bridge.*emqx/i.test(fs.readFileSync(f, 'utf8')),
    );
    expect(bridgeUsers).toEqual([]);
  });
});

// ── 12. Unit tests ──────────────────────────────────────────────────────────

describe('Phase 21 · unit tests (master:5220)', () => {
  it('covers status transitions and assignment logic', () => {
    const spec = read('backend/src/modules/equipment/__tests__/equipment.service.spec.ts');
    expect(spec).toMatch(/status/i);
    expect(spec).toMatch(/assign/i);
  });
});

// ── 13. Offline sync ────────────────────────────────────────────────────────

describe('Phase 21 · equipment in the offline-sync contract (master:3578, 3582; §17.4, §17.6)', () => {
  it('is a pushable entity type', () => {
    // "Equipment usage" is in the §17.4 offline read/write list and holds sync priority 7 on
    // reconnect. It was the one entry in that list with no case in SyncService.push, so a device
    // that queued one was told "saved, will sync" and then got 400 forever.
    expect(syncTypes).toMatch(/^\s*'equipment',$/m);
  });

  it('has a push handler, not just a name on the list', () => {
    expect(syncService).toContain("case 'equipment':");
    expect(syncService).toContain('recordUtilization');
  });

  it('is pullable too — §17.4 says READ/write', () => {
    expect(syncService).toContain("table: 'equipment_telemetry.equipment_utilization'");
  });

  it('carries the same role gate as the REST route it replays', () => {
    expect(syncAuthz).toContain('equipment: EQUIPMENT_WRITE_ROLES');
    expect(syncAuthz).toContain('equipment: EQUIPMENT_READ_ROLES');
  });

  it('is covered by the write-never-wider-than-read invariant', () => {
    const invariants = syncAuthz.slice(syncAuthz.indexOf('writeNeverWiderThanRead'));
    expect(invariants).toContain("'equipment'");
  });

  it('replays idempotently — a retry must not double-count hours', () => {
    // §17.2 retries a queued mutation up to five times, so a repeated payload is designed
    // behaviour. hours_operated and fuel_consumed are only ever summed, so an appended duplicate
    // inflates them with nothing to notice it.
    const repo = read('backend/src/modules/equipment/equipment.repository.ts');
    expect(repo).toContain('ON CONFLICT (tenant_id, equipment_id, recorded_at) DO NOTHING');
    expect(
      read(
        'backend/prisma/migrations/20260825000002_equipment_utilization_idempotent/migration.sql',
      ),
    ).toMatch(/CREATE UNIQUE INDEX[\s\S]*\(tenant_id, equipment_id, recorded_at\)/);
  });
});
