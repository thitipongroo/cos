/**
 * Phase 11 — the AI schema against a migrated database: token tracking (master:3837-3849) and the
 * vector store the embedding worker writes into (master:3776, 3823, 3875).
 *
 * THE POLICY SHAPE IS READ FROM pg_policies, NOT FROM THE MIGRATIONS. The original
 * 20260608000002_ai_usage_logs created a lone RESTRICTIVE policy — which grants nothing on its own —
 * and 20260623000002_consolidate_rls_single_permissive later normalised all fourteen domain schemas
 * to one PERMISSIVE `rls_tenant_isolation`. Grepping the older file gives a false answer; only the
 * live catalogue says what is in force.
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

/** master:3838-3848 — `true` where the spec writes NOT NULL (or PK). */
const USAGE_COLUMNS: Record<string, boolean> = {
  log_id: true,
  tenant_id: true,
  service_caller: true,
  template_name: false,
  model_used: true,
  prompt_tokens: true,
  completion_tokens: true,
  total_tokens: true,
  latency_ms: false,
  created_at: true,
};

interface ColumnRow {
  column_name: string;
  is_nullable: string;
  data_type: string;
  udt_name: string;
  character_maximum_length: number | null;
}

describe('Phase 11 · the ai schema on a migrated database', () => {
  let infra: IntegrationInfra;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
  });

  afterAll(async () => {
    await stopIntegrationInfra(infra);
  });

  const columnsOf = (table: string) =>
    infra.prisma.$queryRawUnsafe<ColumnRow[]>(
      `SELECT column_name, is_nullable, data_type, udt_name, character_maximum_length
         FROM information_schema.columns WHERE table_schema = 'ai' AND table_name = $1`,
      table,
    );

  const policiesOf = (table: string) =>
    infra.prisma.$queryRawUnsafe<
      Array<{ policyname: string; permissive: string; roles: string; qual: string; wc: string }>
    >(
      `SELECT policyname, permissive, array_to_string(roles, ',') AS roles,
              COALESCE(qual, '') AS qual, COALESCE(with_check, '') AS wc
         FROM pg_policies WHERE schemaname = 'ai' AND tablename = $1`,
      table,
    );

  // ---------------------------------------------------------------------------------------------
  describe('ai_usage_logs (master:3838-3849)', () => {
    it('carries every column master declares', async () => {
      const present = (await columnsOf('ai_usage_logs')).map((c) => c.column_name);
      for (const c of Object.keys(USAGE_COLUMNS)) expect(present).toContain(c);
    });

    it('enforces NOT NULL exactly where master writes it', async () => {
      const cols = await columnsOf('ai_usage_logs');
      for (const [column, required] of Object.entries(USAGE_COLUMNS)) {
        if (!required) continue;
        expect(cols.find((c) => c.column_name === column)?.is_nullable).toBe('NO');
      }
    });

    it('leaves template_name and latency_ms nullable', async () => {
      // Both are genuinely optional: a raw completion has no template, and a failed call has no
      // latency worth recording. Making them NOT NULL would force a placeholder into the billing
      // table — and a zero latency is not the same fact as an unknown one.
      const cols = await columnsOf('ai_usage_logs');
      expect(cols.find((c) => c.column_name === 'template_name')?.is_nullable).toBe('YES');
      expect(cols.find((c) => c.column_name === 'latency_ms')?.is_nullable).toBe('YES');
    });

    it('stores model_used as a string, not an enum (master:3879)', async () => {
      // "logs model_used as a string". An enum would need a migration every time a provider ships a
      // model — and the routing table is meant to be changed in config, not in DDL.
      const col = (await columnsOf('ai_usage_logs')).find((c) => c.column_name === 'model_used');
      expect(col?.data_type).toBe('character varying');
      expect(col?.character_maximum_length).toBe(100);
    });

    it('counts tokens as integers', async () => {
      const cols = await columnsOf('ai_usage_logs');
      for (const c of ['prompt_tokens', 'completion_tokens', 'total_tokens']) {
        expect(cols.find((x) => x.column_name === c)?.data_type).toBe('integer');
      }
    });

    it('carries the (tenant_id, created_at) index master names', async () => {
      // The billing read is "this tenant's usage over this period" — master §26.1 meters monthly.
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
        `SELECT indexdef FROM pg_indexes WHERE schemaname = 'ai' AND tablename = 'ai_usage_logs'`,
      );
      expect(rows.some((r) => /\(tenant_id,\s*created_at( DESC)?\)/.test(r.indexdef))).toBe(true);
    });

    it('is tenant-isolated in the canonical PERMISSIVE form', async () => {
      const rows = await policiesOf('ai_usage_logs');
      expect(rows).toHaveLength(1);
      expect(rows[0].policyname).toBe('rls_tenant_isolation');
      // A lone RESTRICTIVE policy — which this table shipped with originally — grants nothing at
      // all: RESTRICTIVE narrows, it never permits. Under app_user every SELECT would return zero
      // rows and every INSERT would fail, silently, on the one table billing is computed from.
      expect(rows[0].permissive).toBe('PERMISSIVE');
      expect(rows[0].roles).toBe('app_user');
      expect(rows[0].qual).toContain('NULLIF');
      expect(rows[0].wc).toContain('app.current_tenant_id');
    });

    it('FORCEs row level security', async () => {
      const rows = await infra.prisma.$queryRawUnsafe<
        Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>
      >(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'ai.ai_usage_logs'::regclass`,
      );
      expect(rows[0].relrowsecurity).toBe(true);
      expect(rows[0].relforcerowsecurity).toBe(true);
    });

    it('accepts a usage row and returns the totals unrounded', async () => {
      // Token counts are what the overage in master §26.1 is computed from; a write path that
      // silently coerced them would misbill every tenant on the plan.
      const tenantId = randomUUID();
      await infra.prisma.$executeRawUnsafe(
        `INSERT INTO ai.ai_usage_logs
           (tenant_id, service_caller, template_name, model_used,
            prompt_tokens, completion_tokens, total_tokens, latency_ms)
         VALUES ($1::uuid, 'ai.rag', 'report-executive-v1', 'gpt-4o', 1234, 567, 1801, 842)`,
        tenantId,
      );
      const rows = await infra.prisma.$queryRawUnsafe<
        Array<{ total_tokens: number; model_used: string }>
      >(
        `SELECT total_tokens, model_used FROM ai.ai_usage_logs WHERE tenant_id = $1::uuid`,
        tenantId,
      );
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].total_tokens)).toBe(1801);
      expect(rows[0].model_used).toBe('gpt-4o');
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('document_embeddings — the pgvector store (master:3776, 3823, 3875)', () => {
    it('the vector extension is installed', async () => {
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ extname: string }>>(
        `SELECT extname FROM pg_extension WHERE extname = 'vector'`,
      );
      expect(rows).toHaveLength(1);
    });

    it('the embedding column is vector(1536)', async () => {
      // "pgvector (vector(1536))" — the width text-embedding-3-small produces. A mismatch is not a
      // degraded search; the INSERT is rejected outright, one layer away from the provider that
      // chose the width.
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ typ: string }>>(
        `SELECT format_type(a.atttypid, a.atttypmod) AS typ
           FROM pg_attribute a
          WHERE a.attrelid = 'ai.document_embeddings'::regclass
            AND a.attname = 'embedding'`,
      );
      expect(rows[0].typ).toBe('vector(1536)');
    });

    it('refuses a vector of the wrong width', async () => {
      // The guard asserted as behaviour, not as a column type: this is what stops a provider swap
      // from quietly writing 3072-dimension vectors into a 1536 column.
      const tenantId = randomUUID();
      const wrongWidth = `[${Array.from({ length: 8 }, () => '0.1').join(',')}]`;
      await expect(
        infra.prisma.$executeRawUnsafe(
          `INSERT INTO ai.document_embeddings
             (tenant_id, source_type, source_id, chunk_text, content_hash, chunk_index, embedding)
           VALUES ($1::uuid, 'document', $2::uuid, 'text', $3, 0, $4::vector)`,
          tenantId,
          randomUUID(),
          'a'.repeat(64),
          wrongWidth,
        ),
      ).rejects.toThrow();
    });

    it('stores a 1536-wide vector', async () => {
      // The control for the test above: without it, a rejection could mean the INSERT is broken for
      // some unrelated reason and the width check would pass for the wrong cause.
      const tenantId = randomUUID();
      const vector = `[${Array.from({ length: 1536 }, () => '0.01').join(',')}]`;
      await infra.prisma.$executeRawUnsafe(
        `INSERT INTO ai.document_embeddings
           (tenant_id, source_type, source_id, chunk_text, content_hash, chunk_index, embedding)
         VALUES ($1::uuid, 'site_report', $2::uuid, 'a daily report', $3, 0, $4::vector)`,
        tenantId,
        randomUUID(),
        'b'.repeat(64),
        vector,
      );
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ n: number }>>(
        `SELECT vector_dims(embedding) AS n FROM ai.document_embeddings WHERE tenant_id = $1::uuid`,
        tenantId,
      );
      expect(Number(rows[0].n)).toBe(1536);
    });

    it('dedups per tenant and source, not globally', async () => {
      // Two tenants storing identical text is not a leak (§22.3 Enforcement Rule 4), so uniqueness
      // is scoped. A global unique index would let one tenant's ingest block another's.
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
        `SELECT indexdef FROM pg_indexes
          WHERE schemaname = 'ai' AND tablename = 'document_embeddings' AND indexdef LIKE '%UNIQUE%'`,
      );
      expect(rows.some((r) => /\(tenant_id,\s*source_id,\s*chunk_index\)/.test(r.indexdef))).toBe(
        true,
      );
    });

    it('has an ANN index so retrieval does not scan every row', async () => {
      const rows = await infra.prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
        `SELECT indexdef FROM pg_indexes
          WHERE schemaname = 'ai' AND tablename = 'document_embeddings'`,
      );
      expect(rows.some((r) => /USING hnsw/.test(r.indexdef))).toBe(true);
      // Cosine, matching the metric the chain config declares.
      expect(rows.some((r) => /vector_cosine_ops/.test(r.indexdef))).toBe(true);
    });

    it('is tenant-isolated in the canonical form', async () => {
      const rows = await policiesOf('document_embeddings');
      expect(rows).toHaveLength(1);
      expect(rows[0].policyname).toBe('rls_tenant_isolation');
      expect(rows[0].permissive).toBe('PERMISSIVE');
      expect(rows[0].roles).toBe('app_user');
      expect(rows[0].qual).toContain('NULLIF');
      expect(rows[0].wc).toContain('app.current_tenant_id');
    });
  });
});
