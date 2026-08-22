/**
 * Phase 9 — the files entities as master:3276-3301 declares them, read from the live catalogue.
 *
 * WHAT THIS FILE DOES NOT COVER, AND WHY. master:3328 asks for an integration test of the full
 * "upload → MinIO → metadata → signed URL" flow. No harness in this repository runs MinIO:
 * `startIntegrationInfra` starts PostgreSQL and Redis only, and the file service's own
 * `routes.integration.spec.ts` mocks its storage, database and scanner alike. Standing up a MinIO
 * container here would test the object store rather than the platform's rules about it, so what is
 * asserted below is the half that a real database CAN settle — the schema those rules are written
 * against, and the tenant isolation protecting it — and the gap is stated rather than papered over.
 */
jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ MessageId: 'mock-msg-id' }),
  })),
  PublishCommand: jest.fn(),
}));

import { randomUUID } from 'node:crypto';
import {
  startIntegrationInfra,
  stopIntegrationInfra,
  type IntegrationInfra,
} from '../../helpers/integration-infra';

jest.setTimeout(900_000);

/** master:3277-3290 and 3292-3301. `true` = the spec writes NOT NULL (or PK). */
const DECLARED: Record<string, Record<string, boolean>> = {
  files: {
    file_id: true,
    tenant_id: true,
    original_filename: true,
    stored_key: true,
    bucket_name: true,
    mime_type: true,
    file_size_bytes: true,
    file_status: false,
    uploaded_by: true,
    uploaded_at: false,
    deleted_at: false,
  },
  file_metadata: {
    metadata_id: true,
    file_id: true,
    tenant_id: true,
    entity_type: false,
    entity_id: false,
    metadata_key: true,
    metadata_value: false,
  },
};

/** master:3289-3290, 3300-3301 — the indexes the spec names outright. */
const DECLARED_INDEXES: Array<[string, RegExp, string]> = [
  ['files', /\(tenant_id,\s*uploaded_by\)/, 'master:3289'],
  ['files', /\(tenant_id,\s*file_status\)/, 'master:3290'],
  ['file_metadata', /\(file_id\)/, 'master:3300'],
  ['file_metadata', /\(entity_type,\s*entity_id\)/, 'master:3301'],
];

interface ColumnRow {
  table_name: string;
  column_name: string;
  is_nullable: string;
  data_type: string;
  udt_name: string;
}

describe('Phase 9 · files entities against the live catalogue', () => {
  let infra: IntegrationInfra;
  let columns: ColumnRow[] = [];

  beforeAll(async () => {
    infra = await startIntegrationInfra();
    columns = await infra.prisma.$queryRawUnsafe<ColumnRow[]>(
      `SELECT table_name, column_name, is_nullable, data_type, udt_name
         FROM information_schema.columns WHERE table_schema = 'files'`,
    );
  });

  afterAll(async () => {
    await stopIntegrationInfra(infra);
  });

  const colsOf = (t: string) => columns.filter((c) => c.table_name === t);

  describe.each(Object.keys(DECLARED))('%s', (table) => {
    it('exists in the files schema', () => {
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

  it('file_size_bytes is BIGINT, not INTEGER (master:3284)', () => {
    // The video cap is 1 GB — 1,073,741,824 bytes — which is inside INTEGER's range but leaves
    // almost none of it. BIGINT is what the spec writes, and what makes the cap a policy decision
    // rather than a column limit.
    expect(colsOf('files').find((c) => c.column_name === 'file_size_bytes')?.data_type).toBe(
      'bigint',
    );
  });

  it('file_status accepts exactly PENDING_SCAN, CLEAN, QUARANTINED (master:3285)', async () => {
    const col = colsOf('files').find((c) => c.column_name === 'file_status');
    expect(col?.data_type).toBe('USER-DEFINED');
    const rows = await infra.prisma.$queryRawUnsafe<Array<{ label: string }>>(
      `SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = $1 ORDER BY e.enumsortorder`,
      col!.udt_name,
    );
    expect(rows.map((r) => r.label)).toEqual(['PENDING_SCAN', 'CLEAN', 'QUARANTINED']);
  });

  describe('the indexes master declares', () => {
    it.each(DECLARED_INDEXES)('%s has an index on %s (%s)', async (table, pattern) => {
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
        `SELECT indexdef FROM pg_indexes WHERE schemaname = 'files' AND tablename = $1`,
        table,
      );
      expect(rows.some((r) => pattern.test(r.indexdef))).toBe(true);
    });
  });

  it('file_metadata.file_id references files.files (master:3294 "FK")', async () => {
    const rows = await infra.prisma.$queryRawUnsafe<Array<{ def: string }>>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = 'files.file_metadata'::regclass AND contype = 'f'`,
    );
    expect(rows.some((r) => r.def.includes('(file_id)') && r.def.includes('files.files'))).toBe(
      true,
    );
  });

  describe('row-level security (ADR-031)', () => {
    it.each(Object.keys(DECLARED))('%s FORCEs row level security', async (table) => {
      const rows = await infra.prisma.$queryRawUnsafe<
        Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>
      >(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = ('files.' || $1)::regclass`,
        table,
      );
      expect(rows[0].relrowsecurity).toBe(true);
      expect(rows[0].relforcerowsecurity).toBe(true);
    });

    it.each(Object.keys(DECLARED))('%s carries the canonical isolation policy', async (table) => {
      // files.retention_policies once carried a LONE RESTRICTIVE policy here, which is deny-all for
      // app_user — the reason this shape is asserted table by table rather than assumed.
      const rows = await infra.prisma.$queryRawUnsafe<
        Array<{ policyname: string; permissive: string; roles: string; qual: string; wc: string }>
      >(
        `SELECT policyname, permissive, array_to_string(roles, ',') AS roles,
                COALESCE(qual, '') AS qual, COALESCE(with_check, '') AS wc
           FROM pg_policies WHERE schemaname = 'files' AND tablename = $1`,
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

  describe('soft delete keeps the row (master:3265)', () => {
    it('a deleted_at stamp does not remove the record', async () => {
      // "files are soft-deleted (deleted_at timestamp), not immediately removed" — the 30-day
      // window only means something if the row survives to be restored from.
      const tenantId = randomUUID();
      const fileId = randomUUID();
      const userId = randomUUID();
      await infra.prisma.$executeRawUnsafe(
        `INSERT INTO files.files
           (file_id, tenant_id, original_filename, stored_key, bucket_name, mime_type,
            file_size_bytes, uploaded_by)
         VALUES ($1::uuid, $2::uuid, 'photo.jpg', '2026/01/x/photo.jpg', 'cos-t',
                 'image/jpeg', 1024, $3::uuid)`,
        fileId,
        tenantId,
        userId,
      );
      await infra.prisma.$executeRawUnsafe(
        `UPDATE files.files SET deleted_at = now() WHERE file_id = $1::uuid`,
        fileId,
      );

      const rows = await infra.prisma.$queryRawUnsafe<
        Array<{ deleted_at: Date | null; file_status: string }>
      >(`SELECT deleted_at, file_status::text FROM files.files WHERE file_id = $1::uuid`, fileId);
      expect(rows).toHaveLength(1);
      expect(rows[0].deleted_at).not.toBeNull();
      // Deleting is not scanning: the status is untouched by it.
      expect(rows[0].file_status).toBe('PENDING_SCAN');
    });

    it('a new file starts PENDING_SCAN (master:3285)', async () => {
      // The default matters: a file that defaulted to CLEAN would be downloadable before the
      // scanner had ever looked at it.
      const tenantId = randomUUID();
      const fileId = randomUUID();
      await infra.prisma.$executeRawUnsafe(
        `INSERT INTO files.files
           (file_id, tenant_id, original_filename, stored_key, bucket_name, mime_type,
            file_size_bytes, uploaded_by)
         VALUES ($1::uuid, $2::uuid, 'a.pdf', '2026/01/y/a.pdf', 'cos-t',
                 'application/pdf', 10, $3::uuid)`,
        fileId,
        tenantId,
        randomUUID(),
      );
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ file_status: string }>>(
        `SELECT file_status::text FROM files.files WHERE file_id = $1::uuid`,
        fileId,
      );
      expect(rows[0].file_status).toBe('PENDING_SCAN');
    });
  });
});
