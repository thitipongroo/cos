/**
 * Phase 6 — the site_ops entities as master:2659-2731 declares them, checked against the live
 * catalogue rather than against the Prisma schema file.
 *
 * WHY THE CATALOGUE AND NOT THE SCHEMA FILE. `schema.prisma` is what someone intended; `pg_catalog`
 * is what a request actually meets. The two diverge whenever a migration lands that the schema file
 * did not follow, and every defect this estate has found so far lived in that gap.
 *
 * The ENUM vocabularies are read from `pg_constraint`, because these columns are VARCHAR + CHECK
 * rather than PostgreSQL enums — a distinction that has already cost this suite one wrong fixture.
 *
 * Only the tables master declares are asserted. site_ops holds others (permits, incidents,
 * material_consumptions, carbon_*, and the reference tables) which belong to other Generate items;
 * they are covered where their own spec section is, not smuggled in here.
 */
jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ MessageId: 'mock-msg-id' }),
  })),
  PublishCommand: jest.fn(),
}));

import {
  startIntegrationInfra,
  stopIntegrationInfra,
  type IntegrationInfra,
} from '../helpers/integration-infra';

jest.setTimeout(900_000);

/** master:2659-2731, transcribed. `true` = the spec writes NOT NULL against that column. */
const DECLARED: Record<string, Record<string, boolean>> = {
  site_reports: {
    report_id: true,
    project_id: true,
    tenant_id: true,
    report_date: true,
    submitted_by: true,
    status: false,
    summary: false,
    weather: false,
    manpower_count: false,
    client_submitted_at: false,
    server_received_at: false,
    modified_at: false,
  },
  issues: {
    issue_id: true,
    project_id: true,
    tenant_id: true,
    report_id: false,
    task_id: false,
    title: true,
    description: false,
    issue_type: false,
    severity: false,
    status: false,
    assigned_to: false,
    resolution_note: false,
    client_submitted_at: false,
    modified_at: false,
    created_at: false,
  },
  inspections: {
    inspection_id: true,
    project_id: true,
    tenant_id: true,
    checklist_id: true,
    task_id: false,
    status: false,
    inspected_by: true,
    inspected_at: true,
    notes: false,
  },
  safety_checklists: {
    checklist_id: true,
    project_id: true,
    tenant_id: true,
    checklist_name: true,
    version: false,
    items: true,
    created_at: false,
  },
  manpower_logs: {
    log_id: true,
    report_id: true,
    tenant_id: true,
    trade_type: true,
    worker_count: true,
    hours_worked: true,
  },
  conflict_records: {
    conflict_id: true,
    tenant_id: true,
    entity_type: true,
    entity_id: true,
    client_payload: true,
    server_payload: true,
    conflict_type: false,
    reviewed_by: false,
    reviewed_at: false,
    created_at: false,
  },
};

/** The ENUM vocabularies master writes, per column. */
const VOCABULARIES: Array<[string, string, string[]]> = [
  ['site_reports', 'status', ['DRAFT', 'SUBMITTED', 'ACKNOWLEDGED']],
  ['issues', 'issue_type', ['DEFECT', 'REWORK', 'PUNCH', 'GENERAL']],
  ['issues', 'severity', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']],
  ['issues', 'status', ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']],
  ['inspections', 'status', ['PENDING', 'PASSED', 'FAILED', 'REQUIRES_REINSPECTION']],
  ['conflict_records', 'conflict_type', ['FIELD_CONFLICT', 'STATUS_CONFLICT', 'REJECTED']],
];

interface ColumnRow {
  table_name: string;
  column_name: string;
  is_nullable: string;
  data_type: string;
}

describe('Phase 6 · site_ops entities against the live catalogue', () => {
  let infra: IntegrationInfra;
  let columns: ColumnRow[] = [];

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    columns = await infra.prisma.$queryRawUnsafe<ColumnRow[]>(
      `SELECT table_name, column_name, is_nullable, data_type
         FROM information_schema.columns WHERE table_schema = 'site_ops'`,
    );
  });

  afterAll(async () => {
    await stopIntegrationInfra(infra);
  });

  const columnsOf = (table: string) => columns.filter((c) => c.table_name === table);

  describe.each(Object.keys(DECLARED))('%s', (table) => {
    it('exists in the site_ops schema', () => {
      expect(columnsOf(table).length).toBeGreaterThan(0);
    });

    it('has every column master declares', () => {
      const present = columnsOf(table).map((c) => c.column_name);
      for (const column of Object.keys(DECLARED[table])) {
        expect(present).toContain(column);
      }
    });

    it('enforces NOT NULL exactly where master writes it', () => {
      // The direction that matters is a spec-NOT NULL column found nullable: that is a row the
      // platform will accept without the field the spec says every row must carry.
      for (const [column, required] of Object.entries(DECLARED[table])) {
        if (!required) continue;
        const found = columnsOf(table).find((c) => c.column_name === column);
        expect(found?.is_nullable).toBe('NO');
      }
    });

    it('is tenant-scoped', () => {
      // Every entity in this list carries tenant_id in the spec, and RLS below hangs off it.
      expect(columnsOf(table).map((c) => c.column_name)).toContain('tenant_id');
    });
  });

  describe('declared vocabularies', () => {
    it.each(VOCABULARIES)(
      '%s.%s accepts exactly the values master lists',
      async (table, column, expected) => {
        const rows = await infra.prisma.$queryRawUnsafe<Array<{ def: string }>>(
          `SELECT pg_get_constraintdef(c.oid) AS def
           FROM pg_constraint c
          WHERE c.conrelid = ('site_ops.' || $1)::regclass
            AND c.contype = 'c'
            AND pg_get_constraintdef(c.oid) LIKE '%' || $2 || '%'`,
          table,
          column,
        );
        const definition = rows.map((r) => r.def).join(' ');
        expect(definition).not.toBe('');
        for (const value of expected) {
          expect(definition).toContain(`'${value}'`);
        }
        // And nothing beyond the list: a value the spec never sanctioned is one no reader expects.
        const quoted = [...definition.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
        expect([...new Set(quoted)].sort()).toEqual([...expected].sort());
      },
    );
  });

  describe('constraints master states outright', () => {
    it('site_reports is unique on (project_id, report_date, submitted_by) — master:2673', async () => {
      // "one report per day per submitter" is the premise the whole LAST_WRITE_WINS strategy rests
      // on (master:2570). Without the constraint the strategy is reasoning about a case the database
      // permits anyway.
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ def: string }>>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conrelid = 'site_ops.site_reports'::regclass AND contype = 'u'`,
      );
      expect(rows.map((r) => r.def.replace(/\s+/g, ' '))).toContain(
        'UNIQUE (project_id, report_date, submitted_by)',
      );
    });

    // master writes "FK" against each of these columns. They are listed one per case so a gap reads
    // as the specific relationship that is missing rather than as one opaque red test.
    //
    // These are NOT ruled out by any no-cross-schema-FK policy: no such policy is written anywhere,
    // `site_ops.carbon_records.project_id` already references `projects.projects`, and eight other
    // constraints across the database point at that same table.
    it.each([
      ['site_reports', 'project_id', 'projects.projects', 'master:2662'],
      ['issues', 'project_id', 'projects.projects', 'master:2676'],
      ['issues', 'report_id', 'site_ops.site_reports', 'master:2678'],
      ['issues', 'task_id', 'projects.tasks', 'master:2679 — completion gate #2'],
      ['inspections', 'project_id', 'projects.projects', 'master:2694'],
      ['inspections', 'checklist_id', 'site_ops.safety_checklists', 'master:2696'],
      ['inspections', 'task_id', 'projects.tasks', 'master:2697 — completion gate #1'],
      ['safety_checklists', 'project_id', 'projects.projects', 'master:2705'],
      ['manpower_logs', 'report_id', 'site_ops.site_reports', 'master:2714'],
    ])('%s.%s references %s (%s)', async (table, column, target) => {
      // A completion gate that counts rows by task_id cannot tell "no blocking issue" from "the
      // issue points at a task_id that does not exist" — both are COUNT(*) = 0, and only one of
      // them means the work is clear to close.
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ def: string }>>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conrelid = ('site_ops.' || $1)::regclass AND contype = 'f'`,
        table,
      );
      const matching = rows.filter((r) => r.def.includes(`(${column})`) && r.def.includes(target));
      expect(matching.length).toBeGreaterThan(0);
    });
  });

  describe('row-level security (ADR-031)', () => {
    it.each(Object.keys(DECLARED))('%s FORCEs row level security', async (table) => {
      // Without FORCE, the table's OWNER bypasses every policy — and the owner is the role every
      // migration and every psql session runs as.
      const rows = await infra.prisma.$queryRawUnsafe<
        Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>
      >(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
          WHERE oid = ('site_ops.' || $1)::regclass`,
        table,
      );
      expect(rows[0].relrowsecurity).toBe(true);
      expect(rows[0].relforcerowsecurity).toBe(true);
    });

    it.each(Object.keys(DECLARED))('%s carries the canonical isolation policy', async (table) => {
      const rows = await infra.prisma.$queryRawUnsafe<
        Array<{ policyname: string; permissive: string; roles: string; qual: string; wc: string }>
      >(
        `SELECT policyname, permissive, array_to_string(roles, ',') AS roles,
                COALESCE(qual, '') AS qual, COALESCE(with_check, '') AS wc
           FROM pg_policies WHERE schemaname = 'site_ops' AND tablename = $1`,
        table,
      );

      // Exactly one. A second PERMISSIVE policy widens access by OR; a lone RESTRICTIVE one grants
      // nothing at all and turns the table into a deny-all — both have happened in this codebase.
      expect(rows).toHaveLength(1);
      expect(rows[0].policyname).toBe('rls_tenant_isolation');
      expect(rows[0].permissive).toBe('PERMISSIVE');
      expect(rows[0].roles).toBe('app_user');

      // NULLIF is what makes an UNSET GUC match no row instead of every row: without it,
      // current_setting(...) returns '' and the ::uuid cast errors, and any code path that swallows
      // the error reads as "no tenant filter".
      expect(rows[0].qual).toContain('NULLIF');
      expect(rows[0].qual).toContain('app.current_tenant_id');

      // A read-only policy still lets a caller INSERT a row stamped with someone else's tenant_id.
      expect(rows[0].wc).toContain('app.current_tenant_id');
    });
  });
});
