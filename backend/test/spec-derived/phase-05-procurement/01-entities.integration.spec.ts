/**
 * Phase 5 Generate items 01 and 11 — master:2357-2454, 2465, 2507-2517
 *
 * Entities are checked against a REAL migrated database. The state ENUMs matter most: the spec
 * closes both machines ("Do NOT invent additional states", master:1536), and the database enum is
 * the only place that rule can be enforced rather than merely intended.
 */
import {
  IntegrationInfra,
  startIntegrationInfra,
  stopIntegrationInfra,
} from '../../helpers/integration-infra';

type PrismaLike = IntegrationInfra['prisma'];
jest.setTimeout(900_000);

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: string;
  numeric_precision: number | null;
  numeric_scale: number | null;
  character_maximum_length: number | null;
}

describe('Phase 5 · procurement schema (real database)', () => {
  let infra: IntegrationInfra;
  let prisma: PrismaLike;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    prisma = infra.prisma;
  });
  afterAll(async () => {
    await stopIntegrationInfra(infra);
  });

  const columnsOf = async (schema: string, table: string): Promise<Record<string, ColumnRow>> => {
    const rows = await prisma.$queryRawUnsafe<ColumnRow[]>(
      `SELECT column_name, data_type, is_nullable, numeric_precision, numeric_scale,
              character_maximum_length
         FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
      schema,
      table,
    );
    return Object.fromEntries(rows.map((r) => [r.column_name, r]));
  };

  const indexDefs = async (schema: string, table: string): Promise<string> => {
    const rows = await prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = $2`,
      schema,
      table,
    );
    return rows.map((r) => r.indexdef).join('\n');
  };

  /** Allowed values for a column, whether pinned by a pg ENUM or a CHECK constraint. */
  const allowedValues = async (
    schema: string,
    table: string,
    column: string,
  ): Promise<string[]> => {
    const enumRows = await prisma.$queryRawUnsafe<Array<{ label: string }>>(
      `SELECT e.enumlabel AS label
         FROM information_schema.columns c
         JOIN pg_type t ON t.typname = c.udt_name
         JOIN pg_namespace tn ON tn.oid = t.typnamespace AND tn.nspname = c.udt_schema
         JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE c.table_schema = $1 AND c.table_name = $2 AND c.column_name = $3`,
      schema,
      table,
      column,
    );
    if (enumRows.length) return enumRows.map((r) => r.label).sort();

    const checks = await prisma.$queryRawUnsafe<Array<{ def: string }>>(
      `SELECT pg_get_constraintdef(con.oid) AS def
         FROM pg_constraint con
         JOIN pg_class c ON c.oid = con.conrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = $2 AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) LIKE '%' || $3 || '%'`,
      schema,
      table,
      column,
    );
    const values = new Set<string>();
    for (const r of checks) for (const m of r.def.matchAll(/'([^']+)'/g)) values.add(m[1]);
    return [...values].sort();
  };

  const TABLES = [
    'vendors',
    'purchase_requests',
    'rfqs',
    'quotations',
    'purchase_orders',
    'po_line_items',
    'deliveries',
    'invoices',
  ];

  describe('all eight entities exist and are tenant-isolated (master:2357-2454)', () => {
    it.each(TABLES)('procurement.%s exists', async (t) => {
      expect(Object.keys(await columnsOf('procurement', t)).length).toBeGreaterThan(0);
    });

    it.each(TABLES)('procurement.%s carries tenant_id NOT NULL (master:652)', async (t) => {
      const cols = await columnsOf('procurement', t);
      expect(cols['tenant_id']?.is_nullable).toBe('NO');
    });

    it.each(TABLES)('procurement.%s has RLS enabled and forced (master:896)', async (t) => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>
      >(
        `SELECT c.relrowsecurity, c.relforcerowsecurity FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname='procurement' AND c.relname = $1`,
        t,
      );
      expect(rows[0]?.relrowsecurity).toBe(true);
      expect(rows[0]?.relforcerowsecurity).toBe(true);
    });
  });

  describe('the two state machines are CLOSED at the database (master:1536)', () => {
    it('rfqs.status admits exactly the six specified states (master:1500)', async () => {
      expect(await allowedValues('procurement', 'rfqs', 'status')).toEqual(
        ['AWARDED', 'CANCELLED', 'CLOSED', 'DRAFT', 'EVALUATED', 'PUBLISHED'].sort(),
      );
    });

    it('purchase_orders.status admits exactly the ten specified states (master:1509-1510)', async () => {
      expect(await allowedValues('procurement', 'purchase_orders', 'status')).toEqual(
        [
          'ACKNOWLEDGED',
          'APPROVED',
          'DISPUTED',
          'DRAFT',
          'FULLY_DELIVERED',
          'INVOICED',
          'PAID',
          'PARTIALLY_DELIVERED',
          'PENDING_APPROVAL',
          'SENT',
        ].sort(),
      );
    });

    it('purchase_requests.status admits exactly the five specified states (master:2376)', async () => {
      expect(await allowedValues('procurement', 'purchase_requests', 'status')).toEqual(
        ['APPROVED', 'DRAFT', 'PO_CREATED', 'REJECTED', 'SUBMITTED'].sort(),
      );
    });

    it('invoices.status admits exactly the five specified states (master:2453)', async () => {
      expect(await allowedValues('procurement', 'invoices', 'status')).toEqual(
        ['APPROVED', 'DISPUTED', 'PAID', 'RECEIVED', 'VERIFIED'].sort(),
      );
    });
  });

  describe('financial precision on every money column (master:954)', () => {
    const MONEY: ReadonlyArray<[string, string]> = [
      ['quotations', 'total_amount'],
      ['purchase_orders', 'total_amount'],
      ['po_line_items', 'unit_price'],
      ['po_line_items', 'line_total'],
      ['invoices', 'amount'],
    ];

    it.each(MONEY)('procurement.%s.%s is DECIMAL(19,4)', async (table, column) => {
      const cols = await columnsOf('procurement', table);
      expect(cols[column]?.data_type).toBe('numeric');
      expect(cols[column]?.numeric_precision).toBe(19);
      expect(cols[column]?.numeric_scale).toBe(4);
    });

    it('po_line_items.quantity is DECIMAL(10,4), not 19,4 (master:2429)', async () => {
      const cols = await columnsOf('procurement', 'po_line_items');
      expect(cols['quantity']?.numeric_precision).toBe(10);
      expect(cols['quantity']?.numeric_scale).toBe(4);
    });

    it.each([
      ['quotations', 'currency_code'],
      ['purchase_orders', 'currency_code'],
      ['invoices', 'currency_code'],
    ])('procurement.%s.%s is a 3-char ISO 4217 code', async (table, column) => {
      const cols = await columnsOf('procurement', table);
      expect(cols[column]?.character_maximum_length).toBe(3);
    });
  });

  describe('uniqueness the spec names (master:2369, 2380, 2421)', () => {
    it.each([
      ['vendors', /UNIQUE[\s\S]*tenant_id[\s\S]*vendor_code/],
      ['purchase_requests', /UNIQUE[\s\S]*tenant_id[\s\S]*pr_number/],
      ['purchase_orders', /UNIQUE[\s\S]*tenant_id[\s\S]*po_number/],
    ])('procurement.%s enforces its business key', async (table, pattern) => {
      expect(await indexDefs('procurement', table)).toMatch(pattern);
    });
  });

  describe('Vendor Portal entities, ADR-030 (master:2514-2517)', () => {
    it.each(['vendor_identities', 'vendor_trading_relationships'])(
      'platform.%s exists',
      async (t) => {
        expect(Object.keys(await columnsOf('platform', t)).length).toBeGreaterThan(0);
      },
    );

    it('procurement.rfq_invitations exists and stores a token HASH, never the token', async () => {
      const cols = await columnsOf('procurement', 'rfq_invitations');
      expect(Object.keys(cols).length).toBeGreaterThan(0);
      expect(Object.keys(cols)).toContain('token_hash');
      // A column holding the raw magic-link would make the table a credential store.
      expect(Object.keys(cols)).not.toContain('token');
    });

    it('the vendor tables are CROSS-TENANT — deliberately not RLS-scoped (master:2514)', async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ relname: string; relrowsecurity: boolean }>
      >(
        `SELECT c.relname, c.relrowsecurity FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname='platform'
            AND c.relname IN ('vendor_identities','vendor_trading_relationships')`,
      );
      expect(rows.length).toBe(2);
      // The spec calls these "cross-tenant, no RLS": a vendor is one identity across tenants.
      for (const r of rows) expect(r.relrowsecurity).toBe(false);
    });

    it('rfq_invitations IS tenant-scoped, unlike the vendor identity tables (master:2515)', async () => {
      const rows = await prisma.$queryRawUnsafe<Array<{ relrowsecurity: boolean }>>(
        `SELECT c.relrowsecurity FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname='procurement' AND c.relname='rfq_invitations'`,
      );
      expect(rows[0]?.relrowsecurity).toBe(true);
    });
  });
});
