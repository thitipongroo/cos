// PDPA export collector (ADR-078).
//
// These tests exist to protect the JOIN MAP, not the SQL text. Every attribution below was verified
// against the CREATE TABLE statements, and getting one wrong has two failure modes that are both
// silent: a missing join empties a whole category of someone's subject-rights answer, and a wrong
// join puts ANOTHER PERSON'S rows into it.
//
// The specific trap this guards: a comment in transparency-identity.tsx asserted that
// workforce.workers "carries no FK to platform.users. There is no join." Believing it would have
// dropped identity/contact worker rows, all attendance logs, and the entire financial category.
// `workers.user_id` exists (migration 20260624000001) — so `resolveWorkerId` is the hinge, and a
// user WITHOUT a linked worker must get empty sections rather than someone else's data.

import {
  collect,
  collectFinancial,
  collectLocation,
  collectOperational,
  resolveWorkerId,
  windowBounds,
  type ExportDb,
  type Tx,
} from '../data-export.collector';

const USER = 'user-1';
const WORKER = 'worker-9';

/**
 * A tx double that answers each $queryRaw in order and records the interpolated values, so a test
 * can assert WHICH id a query was scoped to.
 */
function makeTx(results: unknown[][]) {
  const calls: { sql: string; values: unknown[] }[] = [];
  let i = 0;
  const $queryRaw = jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ sql: strings.join('?'), values });
    return Promise.resolve(results[i++] ?? []);
  });
  return { tx: { $queryRaw } as unknown as Tx, calls };
}

/**
 * A shared-DB tenant: one client answers everything, so `calls` stays a single ordered list.
 * `makeSplitDb` below is the ENTERPRISE shape, where the two handles are genuinely different servers.
 */
function makeDb(results: unknown[][]) {
  const { tx, calls } = makeTx(results);
  return { db: { platform: tx, tenant: tx } as ExportDb, calls };
}

/** Two independent handles, each with its own queue and call log — the ENTERPRISE topology. */
function makeSplitDb(platformResults: unknown[][], tenantResults: unknown[][]) {
  const p = makeTx(platformResults);
  const t = makeTx(tenantResults);
  return {
    db: { platform: p.tx, tenant: t.tx } as ExportDb,
    platformCalls: p.calls,
    tenantCalls: t.calls,
  };
}

describe('windowBounds', () => {
  it('normalises absent bounds to null so each query can apply its own date column', () => {
    expect(windowBounds({})).toEqual({ from: null, to: null });
    expect(windowBounds({ from: null, to: null })).toEqual({ from: null, to: null });
    const d = new Date('2026-01-01T00:00:00.000Z');
    expect(windowBounds({ from: d })).toEqual({ from: d, to: null });
  });
});

describe('resolveWorkerId — the hinge', () => {
  it('returns the linked worker id', async () => {
    const { tx, calls } = makeTx([[{ worker_id: WORKER }]]);
    expect(await resolveWorkerId(tx, USER)).toBe(WORKER);
    expect(calls[0]!.sql).toContain('workforce.workers');
    expect(calls[0]!.sql).toContain('user_id');
    expect(calls[0]!.values).toContain(USER);
  });

  it('returns null for an account with no worker row (an office user)', async () => {
    const { tx } = makeTx([[]]);
    expect(await resolveWorkerId(tx, USER)).toBeNull();
  });
});

describe('collectFinancial', () => {
  it('explains the absence rather than returning a blank when there is no worker link', async () => {
    const { tx, calls } = makeTx([]);
    const out = await collectFinancial(tx, null, {});

    // No worker id means no way to attribute a pay rate — querying anyway risks matching nothing or,
    // worse, matching on a wrong key.
    expect(calls).toHaveLength(0);
    // But the tables still appear, each saying WHY it is empty. A silent [] reads the same as a
    // section the export failed to fill, and the subject cannot challenge a gap they cannot see.
    expect(out.map((t) => t.table)).toEqual([
      'workforce.project_workforce',
      'workforce_telemetry.timesheets',
    ]);
    expect(out.every((t) => t.rows.length === 0)).toBe(true);
    expect(out.every((t) => t.note?.includes('not linked to a worker profile'))).toBe(true);
  });

  it('returns rate AND hours, both scoped to the resolved worker id', async () => {
    // daily_rate alone is what was agreed; timesheets is what was actually worked. Neither half on
    // its own tells a person what their work was worth, and this schema has no payroll table.
    const { tx, calls } = makeTx([
      [{ allocation_id: 'a1', daily_rate: '750.0000' }],
      [{ timesheet_id: 't1', regular_hours: '8.00', overtime_hours: '2.00' }],
    ]);
    const out = await collectFinancial(tx, WORKER, {});

    expect(out.map((t) => t.table)).toEqual([
      'workforce.project_workforce',
      'workforce_telemetry.timesheets',
    ]);
    expect(out.every((t) => t.attributedBy.includes('worker_id'))).toBe(true);
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.values).toContain(WORKER);
      expect(call.values).not.toContain(USER);
    }
    // Windowed on the day the hours were worked, not when the sheet was keyed in.
    expect(calls[1]!.sql).toContain('period_date');
  });
});

describe('collectLocation', () => {
  it('attributes each site_ops table by its OWN actor column', async () => {
    const { tx, calls } = makeTx([[], [], [], [], []]);
    const out = await collectLocation(tx, USER, WORKER, {});

    expect(out.map((t) => [t.table, t.attributedBy])).toEqual([
      ['site_ops.site_reports', 'submitted_by'],
      ['site_ops.incidents', 'reported_by'],
      ['site_ops.inspections', 'inspected_by'],
      ['site_ops.issues', 'created_by | assigned_to | report_id → site_reports.submitted_by'],
      ['workforce_telemetry.attendance_logs', 'workers.user_id → worker_id'],
    ]);
    // The four site_ops queries key on the USER; attendance keys on the WORKER.
    expect(calls.slice(0, 4).every((c) => c.values.includes(USER))).toBe(true);
    expect(calls[4]!.values).toContain(WORKER);
  });

  // Each predicate covers rows the others cannot reach, so dropping any one silently loses a class
  // of the subject's own geo-tagged issues.
  it('matches issues on created_by, assigned_to AND the report chain', async () => {
    const { tx, calls } = makeTx([[], [], [], [], []]);
    await collectLocation(tx, USER, WORKER, {});

    const sql = calls[3]!.sql;
    expect(sql).toContain('created_by');
    expect(sql).toContain('assigned_to');
    expect(sql).toContain('site_ops.site_reports');
    expect(sql).toContain('submitted_by');
    // created_by is NULL on historical rows and cannot be backfilled, so the export has to say so —
    // the caveat is invisible from the rows themselves.
    const issues = (await collectLocation(tx, USER, WORKER, {}))[3]!;
    expect(issues.note).toContain('20260804000004');
  });

  it('reports attendance as not-applicable — not missing — when there is no worker link', async () => {
    const { tx, calls } = makeTx([[], [], [], []]);
    const out = await collectLocation(tx, USER, null, {});

    expect(out).toHaveLength(5);
    const attendance = out[4]!;
    expect(attendance.table).toBe('workforce_telemetry.attendance_logs');
    expect(attendance.rows).toEqual([]);
    expect(attendance.note).toContain('not linked to a worker profile');
    // Explained, not queried: there is no worker_id to scope it to.
    expect(calls).toHaveLength(4);
  });

  it('passes the window bounds into every query', async () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-06-30T00:00:00.000Z');
    const { tx, calls } = makeTx([[], [], [], [], []]);
    await collectLocation(tx, USER, WORKER, { from, to });

    for (const call of calls) {
      expect(call.values).toContain(from);
      expect(call.values).toContain(to);
    }
  });
});

describe('collectOperational — the category that spans both databases', () => {
  it('reads audit_logs from PLATFORM and files/payments from the TENANT', async () => {
    // The whole reason ExportDb has two fields. For an ENTERPRISE tenant these are different servers:
    // migrateDataActivity dumps ten domain schemas into the dedicated instance and deliberately not
    // `platform`, while `prisma migrate deploy` creates the platform tables there EMPTY. One handle
    // pointed at the tenant URL returns zero audit rows — no error, just a §30 answer that lies.
    const { db, platformCalls, tenantCalls } = makeSplitDb(
      [[{ log_id: 'a1' }]],
      [[{ file_id: 'f1' }], [{ payment_id: 'p1' }]],
    );
    const out = await collectOperational(db, USER, {});

    expect(platformCalls).toHaveLength(1);
    expect(platformCalls[0]!.sql).toContain('platform.audit_logs');
    expect(tenantCalls.map((c) => c.sql.includes('files.files'))).toEqual([true, false]);
    expect(tenantCalls[1]!.sql).toContain('finance.payments');
    expect(out.map((t) => t.table)).toEqual([
      'platform.audit_logs',
      'files.files',
      'finance.payments',
    ]);
    expect(out[0]!.rows).toHaveLength(1);
  });

  it('exports payment entries without their amounts', async () => {
    // recorded_by traces an ACTION to a user, as audit_logs.actor_id does — that is what is personal.
    // The money is the tenant's; putting it in an individual's portable archive (a former employee's,
    // say) would export the organisation's finances under cover of a subject-rights request.
    const { db, calls } = makeDb([[], [], []]);
    const out = await collectOperational(db, USER, {});

    const sql = calls[2]!.sql;
    expect(sql).toContain('finance.payments');
    expect(sql).toContain('recorded_by');
    expect(sql).not.toContain('amount');
    expect(sql).not.toContain('currency_code');
    expect(out[2]!.note).toContain('Amounts are excluded');
  });
});

describe('collect — category selection', () => {
  it('returns ONLY the requested categories; unrequested ones are absent, not empty', async () => {
    const { db } = makeDb([[], [], []]);
    const out = await collect(db, USER, ['operational'], {});

    expect(Object.keys(out)).toEqual(['operational']);
    expect(out.operational!.map((t) => t.table)).toEqual([
      'platform.audit_logs',
      'files.files',
      'finance.payments',
    ]);
  });

  it('sends identity’s platform and worker halves to their own databases', async () => {
    // platform.users + trusted_devices are the shared platform DB; workforce.workers follows the
    // tenant. So does the worker lookup itself, even though what it resolves is an identity link.
    const { db, platformCalls, tenantCalls } = makeSplitDb(
      [[{ user_id: USER }], []],
      [[{ worker_id: WORKER }], [{ worker_id: WORKER }]],
    );
    const out = await collect(db, USER, ['identity'], {});

    expect(platformCalls.map((c) => c.sql.includes('platform.users'))).toEqual([true, false]);
    expect(platformCalls[1]!.sql).toContain('platform.trusted_devices');
    expect(tenantCalls.every((c) => c.sql.includes('workforce.workers'))).toBe(true);
    expect(out.identity!.map((t) => t.table)).toEqual([
      'platform.users',
      'platform.trusted_devices',
      'workforce.workers',
    ]);
  });

  it('skips the worker lookup entirely when no category needs it', async () => {
    // operational keys on user_id alone. Resolving a worker anyway would be a wasted round trip on
    // every export, including for accounts that have no worker row at all.
    const { db, calls } = makeDb([[], [], []]);
    await collect(db, USER, ['operational'], {});
    expect(calls.some((c) => c.sql.includes('workforce.workers'))).toBe(false);
  });

  it('resolves the worker once and reuses it across categories', async () => {
    const { db, calls } = makeDb([
      [{ worker_id: WORKER }], // resolveWorkerId
      [{ user_id: USER }], // identity: users
      [], // identity: trusted_devices
      [{ worker_id: WORKER }], // identity: workers
      [], // financial: project_workforce
      [], // financial: timesheets
    ]);
    const out = await collect(db, USER, ['identity', 'financial'], {});

    expect(out.identity!.map((t) => t.table)).toEqual([
      'platform.users',
      'platform.trusted_devices',
      'workforce.workers',
    ]);
    expect(out.financial).toHaveLength(2);
    // One lookup, not one per category. Matched on the resolve query's exact shape — the identity
    // section also selects worker_id (from the workers ROW), so a looser predicate counts two.
    expect(
      calls.filter((c) => c.sql.includes('SELECT worker_id FROM workforce.workers')),
    ).toHaveLength(1);
  });

  it('keeps the worker-keyed tables listed, each explaining why it is empty', async () => {
    const { db } = makeDb([
      [], // resolveWorkerId → none
      [{ user_id: USER }], // identity: users
      [], // identity: trusted_devices
      [{ email: 'a@b.com' }], // contact: users
      // financial short-circuits — no query at all
    ]);
    const out = await collect(db, USER, ['identity', 'contact', 'financial'], {});

    // The same tables appear for every subject, so a reader can see the platform's full scope and
    // where they fall outside it — rather than inferring absence from a shorter list.
    expect(out.identity!.map((t) => t.table)).toEqual([
      'platform.users',
      'platform.trusted_devices',
      'workforce.workers',
    ]);
    expect(out.identity![2]!.note).toContain('not linked to a worker profile');
    expect(out.contact!.map((t) => t.table)).toEqual(['platform.users', 'workforce.workers']);
    // An office account genuinely has no pay rate — an explained absence, not a failure.
    expect(out.financial!.every((t) => t.rows.length === 0 && t.note)).toBe(true);
  });

  it('collects every category when all are requested', async () => {
    const { db } = makeDb([[{ worker_id: WORKER }], ...Array.from({ length: 15 }, () => [])]);
    const out = await collect(
      db,
      USER,
      ['identity', 'contact', 'location', 'financial', 'operational'],
      {},
    );
    expect(Object.keys(out).sort()).toEqual([
      'contact',
      'financial',
      'identity',
      'location',
      'operational',
    ]);
  });
});
