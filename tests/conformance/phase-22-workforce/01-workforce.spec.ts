/**
 * Phase 22 — Workforce Service. CONFORMANCE only.
 *
 * The two hypertables, their partition columns, the month-scale chunking, RLS, the check-in/out
 * cycle and the Site-Engineer approval gate are all asserted against a running database and a
 * booted app by backend/test/phase-22-workforce/01-workforce.integration. Those were
 * dropped from here on 2026-08-25: reading a migration's text is a weaker statement than asking
 * TimescaleDB what it actually created.
 *
 * What stays is the part with no runtime: an Avro payload the service has to match field for field
 * before anything can be published at all, a deferral that is only visible as an absence, and one
 * getter whose failure mode was to record no actor rather than to throw.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { read, readYaml, abs } from '../helpers';

const controller = read('backend/src/modules/workforce/workforce.controller.ts');
const service = read('backend/src/modules/workforce/workforce.service.ts');

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

// ── Cross-source: the emitted payload versus the schema that encodes it ─────

describe('the check-in event matches the schema that has to encode it (§32.4 row 9)', () => {
  const catalog = read('packages/@cos/shared/src/kafka/topic-catalog.ts');
  const payloadOf = (event: string): string[] => {
    const schema = JSON.parse(read(`packages/@cos/shared/src/avro/${event}.avsc`)) as {
      fields: Array<{ name: string; type: { fields?: Array<{ name: string }> } }>;
    };
    return (schema.fields.find((f) => f.name === 'payload')?.type.fields ?? []).map((f) => f.name);
  };

  it('emits every field the schema requires', () => {
    // checkin_id, checkin_at and method are required WITH NO DEFAULT. The service used to emit the
    // master:5338 shorthand — { worker_id, project_id, checked_in_at } — which cannot be encoded
    // against that schema at all, so every check-in failed at the outbox poller instead of reaching
    // Kafka. The cost landed somewhere else entirely: analytics-worker builds
    // site_activity_daily.manpower_total from this event, so the PM dashboard read zero and looked
    // like "no one has checked in yet". The service and the .avsc are two files nothing loads
    // together, which is why the mismatch survived.
    const emitted = service.slice(
      service.indexOf('const eventPayload ='),
      service.indexOf('await this.emitEvent(eventType'),
    );
    for (const field of payloadOf('workforce.checkin.created.v1')) {
      expect(emitted).toContain(`${field}:`);
    }
    // And the shorthand's field, which the schema does not have at all, is gone.
    expect(emitted).not.toContain('checked_in_at:');
  });

  it('the schema itself carries §32.4 row 9, not the phase-command shorthand', () => {
    // master:5338 abbreviates it to three fields; §32.4 is the canonical table and names six,
    // including the capture method and the location. Same relationship as site.report.created.v1,
    // where master was corrected to defer to §32.4.
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

// ── Cross-source: the contract document versus the controller ──────────────

describe('the OpenAPI document describes the routes that exist (master:5333)', () => {
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

// ── Absence: @Roles without RolesGuard is not protection ───────────────────

describe('every guarded route actually runs the guard', () => {
  it('pairs RolesGuard with JwtAuthGuard on every @UseGuards', () => {
    // @Roles is SetMetadata — inert on its own. A controller decorated with roles but missing the
    // guard reads as protected and is not, and no request will ever fail to reveal it: the route
    // simply admits everyone. Asserted as "no @UseGuards lacks RolesGuard", which is the absence.
    const guards = controller.match(/@UseGuards\([^)]*\)/g) ?? [];
    expect(guards.length).toBeGreaterThan(0);
    expect(guards.filter((g) => !g.includes('RolesGuard'))).toEqual([]);
  });

  it('keeps the wider write roles out of the approval set (master:5325)', () => {
    // Approval is where hours become payable, so it is deliberately NOT the set that can record
    // them. The integration suite proves a PM is refused; this proves the constant they are refused
    // BY has not quietly grown the role back.
    const approveRoles = controller.slice(
      controller.indexOf('TIMESHEET_APPROVE_ROLES = ['),
      controller.indexOf('] as const;', controller.indexOf('TIMESHEET_APPROVE_ROLES = [')),
    );
    expect(approveRoles).not.toContain('PROJECT_MANAGER');
  });
});

// ── Absence: biometric check-in stays deferred ─────────────────────────────

describe('biometric check-in stays deferred (master:5332)', () => {
  it('has no verifyCheckIn implementation anywhere', () => {
    const implementers = sourceFiles.filter((f) =>
      /verifyCheckIn\s*\(/.test(fs.readFileSync(f, 'utf8')),
    );
    expect(implementers).toEqual([]);
  });

  it('pulls no biometric vendor SDK into the workforce module', () => {
    // §13.5 leaves the vendor unselected on purpose — "Vendor SDK is injected via DI at deployment
    // time. No vendor is selected at the platform level." A dependency here would be that decision
    // made by accident, and the three specs that describe the method vocabulary do not even agree
    // with each other yet (master:5314 vs §13.5 vs §32.4).
    //
    // Scoped to the SERVER module, not the repo. apps/mobile has a `biometric` store and lib for a
    // DIFFERENT feature — unlocking the app on the handset via expo-local-authentication. Worker
    // verification at a site turnstile is what master:5332 defers. A repo-wide substring scan flags
    // the app lock and reads as a violation.
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

// ── Absence: the actor is a real user, everywhere ──────────────────────────

describe('every event records the platform user, never a literal', () => {
  it('the workforce getter reads req.userId with a CLS fallback', () => {
    // The getter read req.user?.sub — the KEYCLOAK id — off a property Passport does not reliably
    // publish to a Scope.REQUEST provider under Fastify, so it fell through to 'system' and every
    // workforce event recorded no actor. Unlike the equipment module's identical getter this never
    // crashed: actor_id lands in outbox JSON, not in a UUID column, so nothing complained.
    //
    // Comment lines are stripped first. The note inside the getter explains the old behaviour and
    // names both `req.user?.sub` and 'system', so a scan that keeps comments matches the very text
    // recording the fix — that self-match has happened twice on this assertion already.
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

  it('no module anywhere still falls back to the literal', () => {
    // One pattern across the repo, so a reader can tell at a glance which id an event carries.
    const equipment = read('backend/src/modules/equipment/equipment.service.ts');
    expect(equipment).toMatch(/clsUserId\(\)/);
    const stragglers = sourceFiles.filter((f) =>
      /user\?\.sub \?\? 'system'/.test(fs.readFileSync(f, 'utf8')),
    );
    expect(stragglers).toEqual([]);
  });
});
