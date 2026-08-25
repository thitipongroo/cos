/**
 * Phase 22 — Workforce Service (master:5256-5347).
 *
 * Two hypertables with DIFFERENT partition columns and different chunk intervals, a role gate the
 * spec names on one specific route, and three events whose payloads the phase command abbreviates
 * while §32.4 pins them exactly. Each of those is a place where "close enough" is wrong in a way
 * nothing notices until production.
 *
 * The biometric item is negative by instruction: master:5332 says "do not implement until spec
 * defines it", and the three places that describe the method vocabulary do not agree with each
 * other (master:5314 'QR'|'FINGERPRINT'|'FACE'; 13-product-architecture §13.5
 * 'FINGERPRINT'|'FACE_ID'|'IRIS'; §32.4 QR_CODE/GPS/BIOMETRIC/MANUAL). Minting one would be
 * choosing between specs, so this asserts the deferral instead.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { exists, read, readYaml, abs } from '../helpers';

const controller = read('backend/src/modules/workforce/workforce.controller.ts');
const service = read('backend/src/modules/workforce/workforce.service.ts');
const migration = read('backend/prisma/migrations/20260608000006_workforce_service/migration.sql');

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
  for (const root of ['backend/src', 'apps/mobile/src']) walk(abs(root));
  return out;
})();

// ── 1. Module shape ─────────────────────────────────────────────────────────

describe('Phase 22 · module (master:5330)', () => {
  it.each([
    'workforce.module.ts',
    'workforce.service.ts',
    'workforce.repository.ts',
    'workforce.controller.ts',
  ])('has %s', (file) => {
    expect(exists(`backend/src/modules/workforce/${file}`)).toBe(true);
  });
});

// ── 2-3. PostgreSQL entities ────────────────────────────────────────────────

describe('Phase 22 · entities (master:5264-5286)', () => {
  it('enumerates employment types exactly as the spec lists them', () => {
    expect(migration).toContain(
      `CREATE TYPE workforce.employment_type_enum AS ENUM ('PERMANENT', 'CONTRACT', 'SUBCONTRACT')`,
    );
  });

  it('keeps an employee code unique per tenant', () => {
    expect(migration).toContain('UNIQUE (tenant_id, employee_code)');
  });

  it('stores trade_type as free text, not an enum', () => {
    // master:5270 gives examples ("Carpenter", "Welder", "Electrician") rather than a closed set —
    // an enum here would reject the next trade a site hires.
    expect(migration).toMatch(/trade_type\s+VARCHAR\(100\) NOT NULL/);
  });

  it('stores the daily rate as DECIMAL(19,4) with a currency', () => {
    expect(migration).toMatch(/daily_rate\s+DECIMAL\(19,4\)/);
    expect(migration).toMatch(/currency_code\s+VARCHAR\(3\)/);
  });

  it('lets an allocation stay open — end_date is nullable', () => {
    const table = migration.slice(
      migration.indexOf('CREATE TABLE workforce.project_workforce'),
      migration.indexOf(');', migration.indexOf('CREATE TABLE workforce.project_workforce')),
    );
    expect(table).toMatch(/start_date\s+DATE NOT NULL/);
    expect(table).toMatch(/end_date\s+DATE(?!\s+NOT NULL)/);
  });
});

// ── 4-5. Hypertables ────────────────────────────────────────────────────────

describe('Phase 22 · hypertables (master:5288-5309)', () => {
  it('partitions attendance_logs on recorded_at', () => {
    expect(migration).toMatch(
      /create_hypertable\(\s*'workforce_telemetry\.attendance_logs',\s*'recorded_at'/,
    );
  });

  it('indexes attendance by worker AND by project, both newest-first', () => {
    // Two indexes, because the two questions are different: "this worker's history" and "who was on
    // this project". master:5298-5299 names both.
    expect(migration).toMatch(/\(worker_id, recorded_at DESC\)/);
    expect(migration).toMatch(/\(project_id, recorded_at DESC\)/);
  });

  it('partitions timesheets on period_date BY MONTH', () => {
    // master:5303 says "partition key (by month)". A default chunk interval would be 7 days, which
    // still works but shards a monthly table into four chunks per period.
    const block = migration.slice(migration.indexOf("'workforce_telemetry.timesheets'"));
    expect(block).toContain("'period_date'");
    expect(block).toMatch(/chunk_time_interval => INTERVAL '1 month'/);
  });

  it('enumerates timesheet statuses exactly as the spec lists them', () => {
    expect(migration).toContain(
      `CREATE TYPE workforce_telemetry.timesheet_status_enum AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED')`,
    );
  });
});

// ── 6. API surface ──────────────────────────────────────────────────────────

describe('Phase 22 · API surface (master:5317-5326)', () => {
  const routes: Array<[string, string, string]> = [
    ["@Controller('workers')", '@Post', '()'],
    ["@Controller('workers')", '@Get', '()'],
    ["@Controller('workers')", '@Get', "(':id')"],
    ["@Controller('workers')", '@Post', "(':id/attendance')"],
    ["@Controller('workers')", '@Get', "(':id/attendance')"],
    ["@Controller('projects/:projectId/workforce')", '@Post', '()'],
    ["@Controller('projects/:projectId/workforce')", '@Get', '()'],
    ["@Controller('projects/:projectId/workforce')", '@Get', "('summary')"],
    ["@Controller('timesheets')", '@Post', '()'],
    ["@Controller('timesheets')", '@Patch', "(':id/approve')"],
  ];

  it.each(routes)('exposes %s %s%s', (ctrl, verb, suffix) => {
    const from = controller.indexOf(ctrl);
    expect(from).toBeGreaterThan(-1);
    const nextCtrl = controller.indexOf('@Controller(', from + 1);
    const block = controller.slice(from, nextCtrl === -1 ? undefined : nextCtrl);
    expect(block).toContain(`${verb}${suffix}`);
  });
});

// ── 7. Timesheet approval role ──────────────────────────────────────────────

describe('Phase 22 · timesheet approval (master:5325)', () => {
  it('narrows approval to Site Engineer, tighter than the write routes', () => {
    // master:5325 states the role inline — the only route in this phase that does. Approval is the
    // point where hours become payable, so it is deliberately not the same set that can record them.
    expect(controller).toMatch(
      /TIMESHEET_APPROVE_ROLES = \[CosRole\.SITE_ENGINEER, CosRole\.TENANT_ADMIN\]/,
    );
    const approve = controller.slice(controller.indexOf("@Patch(':id/approve')"));
    expect(approve.slice(0, 200)).toContain('@Roles(...TIMESHEET_APPROVE_ROLES)');
  });

  it('does not let the wider write roles approve', () => {
    const approveRoles = controller.slice(
      controller.indexOf('TIMESHEET_APPROVE_ROLES = ['),
      controller.indexOf('] as const;', controller.indexOf('TIMESHEET_APPROVE_ROLES = [')),
    );
    expect(approveRoles).not.toContain('PROJECT_MANAGER');
  });

  it('pairs RolesGuard with JwtAuthGuard everywhere', () => {
    // @Roles is SetMetadata — inert on its own. Asserted as a pair for the same reason the equipment
    // module needed both: decorators without the guard read as protection that is not there.
    const guards = controller.match(/@UseGuards\([^)]*\)/g) ?? [];
    expect(guards.length).toBeGreaterThan(0);
    expect(guards.filter((g) => !g.includes('RolesGuard'))).toEqual([]);
  });
});

// ── 8. OpenAPI ──────────────────────────────────────────────────────────────

describe('Phase 22 · OpenAPI (master:5333)', () => {
  it('documents every route the controller exposes', () => {
    const doc = readYaml<{ openapi: string; paths: Record<string, Record<string, unknown>> }>(
      'docs/api/workforce.openapi.yaml',
    );
    expect(doc.openapi).toMatch(/^3\.1/);
    const expected: Array<[string, string]> = [
      ['/workers', 'post'],
      ['/workers', 'get'],
      ['/workers/me', 'get'],
      ['/workers/{workerId}', 'get'],
      ['/workers/{workerId}/attendance', 'post'],
      ['/workers/{workerId}/attendance', 'get'],
      ['/projects/{projectId}/workforce', 'post'],
      ['/projects/{projectId}/workforce', 'get'],
      ['/projects/{projectId}/workforce/summary', 'get'],
      ['/projects/{projectId}/workforce/directory', 'get'],
      ['/timesheets', 'post'],
      ['/timesheets/{timesheetId}/approve', 'patch'],
    ];
    expect(expected.filter(([p, m]) => !doc.paths[p] || !doc.paths[p][m])).toEqual([]);
  });
});

// ── 9. Events ───────────────────────────────────────────────────────────────

describe('Phase 22 · Kafka events (master:5336-5340; §32.4)', () => {
  const catalog = read('packages/@cos/shared/src/kafka/topic-catalog.ts');
  const payloadOf = (event: string): string[] => {
    const schema = JSON.parse(read(`packages/@cos/shared/src/avro/${event}.avsc`)) as {
      fields: Array<{ name: string; type: { fields?: Array<{ name: string }> } }>;
    };
    return (schema.fields.find((f) => f.name === 'payload')?.type.fields ?? []).map((f) => f.name);
  };

  it('emits a check-in payload the schema can actually encode', () => {
    // The schema's checkin_id, checkin_at and method are required WITH NO DEFAULT. The service used
    // to emit the master:5338 shorthand — { worker_id, project_id, checked_in_at } — which cannot be
    // Avro-encoded against that schema at all, so every check-in event failed at the outbox poller
    // instead of reaching Kafka. The cost landed somewhere else entirely: analytics-worker consumes
    // this event to build site_activity_daily.manpower_total, so the PM dashboard's manpower read
    // zero and looked like "no one checked in yet".
    const emitted = service.slice(
      service.indexOf('const eventPayload ='),
      service.indexOf('await this.emitEvent(eventType'),
    );
    for (const field of payloadOf('workforce.checkin.created.v1')) {
      expect(emitted).toContain(`${field}:`);
    }
    // And the field the shorthand used, which is not in the schema at all, is gone.
    expect(emitted).not.toContain('checked_in_at:');
  });

  it('checkin carries the §32.4 payload, not the phase command shorthand', () => {
    // master:5338 abbreviates it to { worker_id, project_id, checked_in_at }. §32.4 row 9 is the
    // canonical table and names six fields including the capture method and location — the same
    // relationship as site.report.created.v1, where master was corrected to defer to §32.4.
    expect(catalog).toContain(`'workforce.checkin.created.v1'`);
    expect(payloadOf('workforce.checkin.created.v1')).toEqual([
      'checkin_id',
      'worker_id',
      'project_id',
      'checkin_at',
      'method',
      'location',
    ]);
  });

  it.each([
    ['workforce.checkout.created.v1', ['worker_id', 'project_id', 'hours_worked']],
    ['workforce.timesheet.approved.v1', ['worker_id', 'project_id', 'period_date', 'total_hours']],
  ])('%s carries exactly the payload the spec names', (event, fields) => {
    expect(catalog).toContain(`'${event}'`);
    expect(payloadOf(event)).toEqual(fields);
  });
});

// ── 10. Biometric deferral ──────────────────────────────────────────────────

describe('Phase 22 · biometric check-in stays deferred (master:5332)', () => {
  it('has no verifyCheckIn implementation', () => {
    const implementers = sourceFiles.filter((f) =>
      /verifyCheckIn\s*\(/.test(fs.readFileSync(f, 'utf8')),
    );
    expect(implementers).toEqual([]);
  });

  it('pulls no biometric vendor SDK into the workforce module', () => {
    // §13.5 leaves the vendor unselected on purpose — "Vendor SDK is injected via DI at deployment
    // time. No vendor is selected at the platform level." A dependency here would be that decision
    // made by accident.
    //
    // Scoped to the SERVER module, not the whole repo. apps/mobile has a `biometric` store and lib,
    // and they are a DIFFERENT feature: unlocking the app on the handset (Security Settings →
    // Biometric Unlock, expo-local-authentication). Worker verification at a site turnstile is what
    // master:5332 defers. A repo-wide substring scan flags the app lock and reads as a violation.
    const workforceDir = abs('backend/src/modules/workforce');
    const offenders = sourceFiles
      .filter((f) => f.startsWith(workforceDir))
      .filter((f) =>
        /(?:from\s+['"]|require\(\s*['"])[^'"]*(?:biometric|fingerprint|face-?id|neurotec|innovatrics)/i.test(
          fs.readFileSync(f, 'utf8'),
        ),
      );
    expect(offenders).toEqual([]);
  });
});

// ── 11. Unit tests ──────────────────────────────────────────────────────────

describe('Phase 22 · unit tests (master:5334)', () => {
  it('covers attendance calculation and timesheet aggregation', () => {
    const spec = read('backend/src/modules/workforce/__tests__/workforce.service.spec.ts');
    expect(spec).toMatch(/hours/i);
    expect(spec).toMatch(/timesheet/i);
  });
});

// ── 12. Actor attribution ───────────────────────────────────────────────────

describe('Phase 22 · event actor attribution', () => {
  it('resolves the platform user id, never the literal "system"', () => {
    // The getter read req.user?.sub — the KEYCLOAK id — off a property Passport does not reliably
    // publish to a Scope.REQUEST provider under Fastify, so it fell through to 'system' and every
    // workforce event recorded no actor at all. Unlike the equipment module's identical getter this
    // never crashed: actor_id lands in the outbox payload JSON, not in a UUID column.
    // Asserted on the getter's CODE with comment lines stripped. The note inside it explains the old
    // behaviour and names both `req.user?.sub` and 'system', so any substring scan that keeps
    // comments matches the very text that records the fix — twice now, first over the whole file and
    // then over the raw body.
    const from = service.indexOf('private get userId()');
    expect(from).toBeGreaterThan(-1);
    const code = service
      .slice(service.indexOf('{', from), service.indexOf('\n  }', from))
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('//'))
      .join('\n');
    expect(code).not.toContain('user?.sub');
    expect(code).not.toContain("'system'");
    expect(code).toMatch(/req\.userId \?\? clsUserId\(\)/);
  });

  it('is resolved the same way across every module that emits events', () => {
    // One pattern, so a reader can tell at a glance which id an event carries.
    const equipment = read('backend/src/modules/equipment/equipment.service.ts');
    expect(equipment).toMatch(/clsUserId\(\)/);
    const stragglers = sourceFiles.filter((f) =>
      /user\?\.sub \?\? 'system'/.test(fs.readFileSync(f, 'utf8')),
    );
    expect(stragglers).toEqual([]);
  });
});
