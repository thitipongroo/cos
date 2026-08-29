/**
 * Phase 3 Generate item 01 — master:2183, against the entity definitions at master:2067-2158.
 *
 *   "PostgreSQL migration files for all entities"
 *
 * Asserted against a REAL migrated database: what matters is the schema that exists after
 * `migrate deploy`, and several early migrations are superseded by later ones.
 */
import {
  IntegrationInfra,
  startIntegrationInfra,
  stopIntegrationInfra,
} from '../helpers/integration-infra';

type PrismaLike = IntegrationInfra['prisma'];

jest.setTimeout(900_000);

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: string;
  character_maximum_length: number | null;
}

describe('Phase 3 · projects schema (real database)', () => {
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
      `SELECT column_name, data_type, is_nullable, character_maximum_length
         FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2`,
      schema,
      table,
    );
    return Object.fromEntries(rows.map((r) => [r.column_name, r]));
  };

  /**
   * The allowed values for a column, however the schema pins them: a PostgreSQL ENUM type, or a
   * VARCHAR with a CHECK constraint. The spec writes `ENUM(...)` to mean a CLOSED VOCABULARY
   * (master:2074, 2073, 2137); the repo satisfies some of them with VARCHAR + CHECK, which is the
   * same guarantee at the database level. Asserting the pg type would be testing the mechanism
   * instead of the rule.
   */
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
    if (enumRows.length > 0) return enumRows.map((r) => r.label).sort();

    const checkRows = await prisma.$queryRawUnsafe<Array<{ def: string }>>(
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
    for (const r of checkRows) {
      for (const m of r.def.matchAll(/'([^']+)'/g)) values.add(m[1]);
    }
    return [...values].sort();
  };

  const indexDefs = async (schema: string, table: string): Promise<string> => {
    const rows = await prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = $2`,
      schema,
      table,
    );
    return rows.map((r) => r.indexdef).join('\n');
  };

  describe('projects.projects (master:2068-2087)', () => {
    const REQUIRED = [
      'project_id',
      'tenant_id',
      'project_code',
      'project_name',
      'project_type',
      'status',
      'budget_amount',
      'budget_currency',
      'start_date',
      'end_date',
      'on_hold_reason',
      'on_hold_at',
      'cancellation_reason',
      'cancelled_at',
      'created_by',
      'created_at',
      'updated_at',
    ];

    it('has every specified column', async () => {
      const cols = await columnsOf('projects', 'projects');
      expect(Object.keys(cols)).toEqual(expect.arrayContaining(REQUIRED));
    });

    it('budget_amount is DECIMAL(19,4) per the Financial Precision spec (master:954)', async () => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ numeric_precision: number; numeric_scale: number; data_type: string }>
      >(
        `SELECT data_type, numeric_precision, numeric_scale FROM information_schema.columns
          WHERE table_schema='projects' AND table_name='projects' AND column_name='budget_amount'`,
      );
      expect(rows[0]?.data_type).toBe('numeric');
      expect(rows[0]?.numeric_precision).toBe(19);
      expect(rows[0]?.numeric_scale).toBe(4);
    });

    it('budget_currency is a 3-char ISO 4217 code (master:2076)', async () => {
      const cols = await columnsOf('projects', 'projects');
      expect(cols['budget_currency']?.character_maximum_length).toBe(3);
    });

    it.each(['on_hold_reason', 'cancellation_reason'])(
      '%s is VARCHAR(500) as the state machine requires (master:2057, 2062)',
      async (col) => {
        const cols = await columnsOf('projects', 'projects');
        expect(cols[col]?.character_maximum_length).toBe(500);
      },
    );

    it('(tenant_id, project_code) is UNIQUE (master:2086)', async () => {
      const defs = await indexDefs('projects', 'projects');
      expect(defs).toMatch(/UNIQUE[\s\S]*tenant_id[\s\S]*project_code/);
    });

    it('(tenant_id, status) is indexed (master:2087)', async () => {
      const defs = await indexDefs('projects', 'projects');
      expect(defs).toMatch(/tenant_id[\s\S]*status/);
    });

    it('status admits exactly the five specified states (master:2074)', async () => {
      expect(await allowedValues('projects', 'projects', 'status')).toEqual(
        ['ACTIVE', 'CANCELLED', 'COMPLETED', 'DRAFT', 'ON_HOLD'].sort(),
      );
    });

    it('project_type admits exactly the four specified types (master:2073)', async () => {
      expect(await allowedValues('projects', 'projects', 'project_type')).toEqual(
        ['COMMERCIAL', 'INDUSTRIAL', 'INFRASTRUCTURE', 'RESIDENTIAL'].sort(),
      );
    });
  });

  describe('projects.project_members (master:2089-2097)', () => {
    it('has every specified column', async () => {
      const cols = await columnsOf('projects', 'project_members');
      expect(Object.keys(cols)).toEqual(
        expect.arrayContaining([
          'project_id',
          'tenant_id',
          'user_id',
          'role',
          'assigned_at',
          'assigned_by',
        ]),
      );
    });

    it('(project_id, user_id) is UNIQUE (master:2097)', async () => {
      const defs = await indexDefs('projects', 'project_members');
      expect(defs).toMatch(/UNIQUE[\s\S]*project_id[\s\S]*user_id/);
    });
  });

  describe('projects.project_documents (master:2099-2106)', () => {
    it('has every specified column', async () => {
      const cols = await columnsOf('projects', 'project_documents');
      expect(Object.keys(cols)).toEqual(
        expect.arrayContaining([
          'project_id',
          'tenant_id',
          'file_id',
          'document_type',
          'uploaded_by',
          'uploaded_at',
        ]),
      );
    });
  });

  describe('spatial hierarchy + asset entities (master:2110-2157)', () => {
    const TABLES: ReadonlyArray<[string, string[]]> = [
      [
        'buildings',
        [
          'building_id',
          'project_id',
          'tenant_id',
          'building_name',
          'building_type',
          'total_floors',
          'location',
          'status',
        ],
      ],
      ['floors', ['floor_id', 'building_id', 'tenant_id', 'floor_number', 'gross_area_sqm']],
      ['rooms', ['room_id', 'floor_id', 'tenant_id', 'room_number', 'room_type', 'area_sqm']],
      [
        'structures',
        ['structure_id', 'building_id', 'tenant_id', 'structure_type', 'material_type'],
      ],
      [
        'units',
        ['unit_id', 'tenant_id', 'building_id', 'project_id', 'unit_number', 'unit_type', 'status'],
      ],
      [
        'assets',
        [
          'asset_id',
          'project_id',
          'tenant_id',
          'asset_type',
          'handover_date',
          'warranty_expiry',
          'maintenance_status',
        ],
      ],
    ];

    it.each(TABLES)('projects.%s has every specified column', async (table, expected) => {
      const cols = await columnsOf('projects', table);
      expect(Object.keys(cols)).toEqual(expect.arrayContaining(expected));
    });

    it('structures.structure_type admits column/beam/slab/wall (master:2137)', async () => {
      // Implemented as VARCHAR + CHECK rather than a pg ENUM — same closed vocabulary.
      expect(await allowedValues('projects', 'structures', 'structure_type')).toEqual(
        ['beam', 'column', 'slab', 'wall'].sort(),
      );
    });
  });

  describe('every Phase 3 table is tenant-isolated (master:652, 896)', () => {
    const ALL = [
      'projects',
      'project_members',
      'project_documents',
      'buildings',
      'floors',
      'rooms',
      'structures',
      'units',
      'assets',
    ];

    it.each(ALL)('projects.%s carries tenant_id NOT NULL', async (table) => {
      const cols = await columnsOf('projects', table);
      expect(cols['tenant_id']).toBeDefined();
      expect(cols['tenant_id']?.is_nullable).toBe('NO');
    });

    it.each(ALL)('projects.%s has RLS enabled and forced', async (table) => {
      const rows = await prisma.$queryRawUnsafe<
        Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>
      >(
        `SELECT c.relrowsecurity, c.relforcerowsecurity
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'projects' AND c.relname = $1`,
        table,
      );
      expect(rows[0]?.relrowsecurity).toBe(true);
      expect(rows[0]?.relforcerowsecurity).toBe(true);
    });
  });
});
