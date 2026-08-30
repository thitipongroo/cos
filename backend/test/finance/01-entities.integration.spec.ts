/**
 * Phase 7 — the finance entities as master:2874-2935 declares them, read from the live catalogue.
 *
 * Money columns are checked for PRECISION, not merely for being numeric. master's FINANCIAL
 * PRECISION section and every amount line here say DECIMAL(19,4); a column that reached production
 * as numeric with no precision, or as double precision, would accept the same writes and store
 * different values — which is exactly the kind of fault that only shows up in a reconciliation
 * months later.
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

/** master:2874-2935. `true` = the spec writes NOT NULL (or PK) against that column. */
const DECLARED: Record<string, Record<string, boolean>> = {
  project_budgets: {
    budget_id: true,
    project_id: true,
    tenant_id: true,
    total_budget_amount: true,
    total_budget_currency: true,
    allocated_amount: false,
    committed_amount: false,
    actual_amount: false,
    created_at: false,
    updated_at: false,
  },
  budget_lines: {
    line_id: true,
    budget_id: true,
    project_id: true,
    tenant_id: true,
    boq_category_id: false,
    line_name: true,
    allocated_amount: true,
    currency_code: true,
    created_at: false,
  },
  cost_transactions: {
    transaction_id: true,
    project_id: true,
    tenant_id: true,
    source_type: true,
    source_id: true,
    budget_line_id: false,
    amount: true,
    currency_code: true,
    transaction_date: true,
    description: false,
    recorded_at: false,
    recorded_by: false,
  },
  payments: {
    payment_id: true,
    invoice_id: true,
    project_id: true,
    tenant_id: true,
    amount: true,
    currency_code: true,
    payment_date: true,
    payment_reference: false,
    status: false,
    recorded_by: true,
    created_at: false,
  },
  retention_records: {
    retention_id: true,
    po_id: true,
    project_id: true,
    tenant_id: true,
    retention_percentage: false,
    retention_amount: false,
    currency_code: false,
    status: false,
  },
};

/** Columns master writes as DECIMAL(19,4). */
const MONEY: Array<[string, string]> = [
  ['project_budgets', 'total_budget_amount'],
  ['project_budgets', 'allocated_amount'],
  ['project_budgets', 'committed_amount'],
  ['project_budgets', 'actual_amount'],
  ['budget_lines', 'allocated_amount'],
  ['cost_transactions', 'amount'],
  ['payments', 'amount'],
  ['retention_records', 'retention_amount'],
];

/** ENUM vocabularies master writes (master:2902, 2922, 2934). */
const ENUMS: Array<[string, string, string[]]> = [
  ['cost_transactions', 'source_type', ['PURCHASE_ORDER', 'INVOICE', 'ADJUSTMENT']],
  ['payments', 'status', ['PENDING', 'PROCESSED', 'FAILED']],
  ['retention_records', 'status', ['HELD', 'RELEASED', 'PARTIAL_RELEASE']],
];

interface ColumnRow {
  table_name: string;
  column_name: string;
  is_nullable: string;
  data_type: string;
  udt_name: string;
  numeric_precision: number | null;
  numeric_scale: number | null;
}

describe('Phase 7 · finance entities against the live catalogue', () => {
  let infra: IntegrationInfra;
  let columns: ColumnRow[] = [];

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    columns = await infra.prisma.$queryRawUnsafe<ColumnRow[]>(
      `SELECT table_name, column_name, is_nullable, data_type, udt_name,
              numeric_precision, numeric_scale
         FROM information_schema.columns WHERE table_schema = 'finance'`,
    );
  });

  afterAll(async () => {
    await stopIntegrationInfra(infra);
  });

  const colsOf = (t: string) => columns.filter((c) => c.table_name === t);

  describe.each(Object.keys(DECLARED))('%s', (table) => {
    it('exists in the finance schema', () => {
      expect(colsOf(table).length).toBeGreaterThan(0);
    });

    it('has every column master declares', () => {
      const present = colsOf(table).map((c) => c.column_name);
      for (const c of Object.keys(DECLARED[table])) expect(present).toContain(c);
    });

    it('enforces NOT NULL exactly where master writes it', () => {
      for (const [column, required] of Object.entries(DECLARED[table])) {
        if (!required) continue;
        expect(colsOf(table).find((c) => c.column_name === column)?.is_nullable).toBe('NO');
      }
    });

    it('is tenant-scoped', () => {
      expect(colsOf(table).map((c) => c.column_name)).toContain('tenant_id');
    });
  });

  describe('money columns are DECIMAL(19,4)', () => {
    it.each(MONEY)('%s.%s', (table, column) => {
      const col = colsOf(table).find((c) => c.column_name === column);
      expect(col?.data_type).toBe('numeric');
      expect([col?.numeric_precision, col?.numeric_scale]).toEqual([19, 4]);
    });

    it('no finance table stores an amount as a floating-point type', () => {
      // double precision / real cannot represent 0.1; a column that accepts money in one of them is
      // wrong before any code runs.
      const floats = columns
        .filter((c) => /amount|price|cost|total/i.test(c.column_name))
        .filter((c) => ['double precision', 'real'].includes(c.data_type))
        .map((c) => `${c.table_name}.${c.column_name}`);
      expect(floats).toEqual([]);
    });

    it('retention_percentage is DECIMAL(5,2) (master:2931)', () => {
      const col = colsOf('retention_records').find((c) => c.column_name === 'retention_percentage');
      expect([col?.numeric_precision, col?.numeric_scale]).toEqual([5, 2]);
    });
  });

  describe('declared vocabularies', () => {
    it.each(ENUMS)(
      '%s.%s accepts exactly the values master lists',
      async (table, column, expected) => {
        const col = colsOf(table).find((c) => c.column_name === column);
        expect(col?.data_type).toBe('USER-DEFINED');
        const rows = await infra.prisma.$queryRawUnsafe<Array<{ label: string }>>(
          `SELECT e.enumlabel AS label FROM pg_enum e
           JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = $1 ORDER BY e.enumsortorder`,
          col!.udt_name,
        );
        expect(rows.map((r) => r.label)).toEqual(expected);
      },
    );
  });

  describe('constraints master states outright', () => {
    it('project_budgets.project_id is UNIQUE (master:2877)', async () => {
      // "one budget per project" is the premise the aggregation rests on: two budget rows for a
      // project would make every committed/actual total ambiguous.
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ def: string }>>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conrelid = 'finance.project_budgets'::regclass AND contype = 'u'`,
      );
      expect(rows.map((r) => r.def.replace(/\s+/g, ' '))).toContain('UNIQUE (project_id)');
    });

    it('budget_lines.budget_id references project_budgets (master:2889 "FK")', async () => {
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ def: string }>>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conrelid = 'finance.budget_lines'::regclass AND contype = 'f'`,
      );
      expect(rows.some((r) => r.def.includes('(budget_id)'))).toBe(true);
    });

    it('cost_transactions.budget_line_id references budget_lines (master:2904 "FK nullable")', async () => {
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ def: string }>>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conrelid = 'finance.cost_transactions'::regclass AND contype = 'f'`,
      );
      expect(rows.some((r) => r.def.includes('(budget_line_id)'))).toBe(true);
    });

    it('budget_lines.boq_category_id is a LOOSE reference with no FK (master:2892)', async () => {
      // Spelled out in the spec: "loose reference to BOQ category (no FK)". A BOQ version can be
      // superseded without orphaning the budget that was drawn from it.
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ def: string }>>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conrelid = 'finance.budget_lines'::regclass AND contype = 'f'`,
      );
      expect(rows.some((r) => r.def.includes('boq_category_id'))).toBe(false);
    });

    it('cost_transactions carries the declared (project_id, tenant_id, transaction_date) index (master:2911)', async () => {
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
        `SELECT indexdef FROM pg_indexes
          WHERE schemaname = 'finance' AND tablename = 'cost_transactions'`,
      );
      expect(
        rows.some((r) => /\(project_id,\s*tenant_id,\s*transaction_date\)/.test(r.indexdef)),
      ).toBe(true);
    });
  });

  describe('row-level security (ADR-031)', () => {
    it.each(Object.keys(DECLARED))('%s FORCEs row level security', async (table) => {
      const rows = await infra.prisma.$queryRawUnsafe<
        Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>
      >(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = ('finance.' || $1)::regclass`,
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
           FROM pg_policies WHERE schemaname = 'finance' AND tablename = $1`,
        table,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].policyname).toBe('rls_tenant_isolation');
      expect(rows[0].permissive).toBe('PERMISSIVE');
      expect(rows[0].roles).toBe('app_user');
      expect(rows[0].qual).toContain('NULLIF');
      expect(rows[0].wc).toContain('app.current_tenant_id');
    });
  });

  describe('the variance threshold column (master:2991)', () => {
    it('project_budgets.variance_alert_threshold exists as DECIMAL(5,2)', () => {
      // Named outright by master:2991 as where the per-project override is stored, so a threshold
      // that lives only in code would leave TENANT_ADMIN nothing to override.
      const col = colsOf('project_budgets').find(
        (c) => c.column_name === 'variance_alert_threshold',
      );
      expect(col).toBeDefined();
      expect([col?.numeric_precision, col?.numeric_scale]).toEqual([5, 2]);
    });
  });
});
