/**
 * Phase 12 — ai.ai_generated_reports on a migrated database (master:4012-4024).
 *
 * As with ai_usage_logs, the policy shape is read from pg_policies rather than from the creating
 * migration: 20260608000003 wrote a lone RESTRICTIVE policy, which permits nothing by itself, and
 * 20260623000002_consolidate_rls_single_permissive replaced it across every domain schema.
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
} from '../helpers/integration-infra';

/** master:4013-4023 — `true` where the spec writes NOT NULL (or PK). */
const COLUMNS: Record<string, boolean> = {
  report_id: true,
  tenant_id: true,
  project_id: true,
  report_type: true,
  content: true,
  confidence: false,
  model_used: true,
  tokens_used: true,
  generated_at: true,
  generated_by: false,
};

describe('Phase 12 · ai_generated_reports against a real database', () => {
  let infra: IntegrationInfra;

  beforeAll(async () => {
    infra = await startIntegrationInfra();
  });

  afterAll(async () => {
    await stopIntegrationInfra(infra);
  });

  const columns = () =>
    infra.prisma.$queryRawUnsafe<
      Array<{
        column_name: string;
        is_nullable: string;
        data_type: string;
        udt_name: string;
        numeric_precision: number | null;
        numeric_scale: number | null;
      }>
    >(
      `SELECT column_name, is_nullable, data_type, udt_name, numeric_precision, numeric_scale
         FROM information_schema.columns
        WHERE table_schema = 'ai' AND table_name = 'ai_generated_reports'`,
    );

  const insert = (tenantId: string, overrides: Record<string, unknown> = {}) => {
    const confidence = overrides['confidence'] ?? 0.875;
    const reportType = overrides['report_type'] ?? 'SITE_SUMMARY';
    return infra.prisma.$executeRawUnsafe(
      `INSERT INTO ai.ai_generated_reports
         (tenant_id, project_id, report_type, content, confidence, model_used, tokens_used, generated_by)
       VALUES ($1::uuid, $2::uuid, $3::ai.report_type_enum, $4::jsonb, $5::decimal, 'gpt-4o', 1234, $6::uuid)`,
      tenantId,
      randomUUID(),
      reportType,
      JSON.stringify({ summary: 'a summary', confidence }),
      confidence,
      randomUUID(),
    );
  };

  it('carries every column master declares', async () => {
    const present = (await columns()).map((c) => c.column_name);
    for (const c of Object.keys(COLUMNS)) expect(present).toContain(c);
  });

  it('enforces NOT NULL exactly where master writes it', async () => {
    const cols = await columns();
    for (const [column, required] of Object.entries(COLUMNS)) {
      if (!required) continue;
      expect(cols.find((c) => c.column_name === column)?.is_nullable).toBe('NO');
    }
  });

  it('leaves confidence and generated_by nullable', async () => {
    // A guard failure persists no confidence, and a scheduled report has no requesting user. Both
    // are absences with meaning — a NOT NULL here would force a zero that reads as "no confidence".
    const cols = await columns();
    expect(cols.find((c) => c.column_name === 'confidence')?.is_nullable).toBe('YES');
    expect(cols.find((c) => c.column_name === 'generated_by')?.is_nullable).toBe('YES');
  });

  it('stores the report body as JSONB, not text', async () => {
    // Each report type has a different shape (master:3970-3990); JSONB keeps them queryable without
    // a column per capability.
    expect((await columns()).find((c) => c.column_name === 'content')?.data_type).toBe('jsonb');
  });

  it('types report_type as an enum of exactly the four capabilities', async () => {
    const col = (await columns()).find((c) => c.column_name === 'report_type');
    expect(col?.data_type).toBe('USER-DEFINED');
    const labels = await infra.prisma.$queryRawUnsafe<Array<{ label: string }>>(
      `SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = $1 ORDER BY e.enumsortorder`,
      col!.udt_name,
    );
    expect(labels.map((r) => r.label)).toEqual([
      'SITE_SUMMARY',
      'PROCUREMENT_SUMMARY',
      'EXECUTIVE_SUMMARY',
      'DELAY_RISK',
    ]);
  });

  it('refuses a report type outside those four', async () => {
    // The enum is the guard: a typo'd type would otherwise become a row nothing can find, since
    // /reports/history filters by type.
    await expect(insert(randomUUID(), { report_type: 'WEEKLY_SUMMARY' })).rejects.toThrow();
  });

  it('stores confidence as DECIMAL(4,3)', async () => {
    const col = (await columns()).find((c) => c.column_name === 'confidence');
    expect(col?.data_type).toBe('numeric');
    expect(col?.numeric_precision).toBe(4);
    expect(col?.numeric_scale).toBe(3);
  });

  it('keeps three decimal places without rounding them away', async () => {
    // 0.875 is a value the guard's 0.7 threshold can sit near. Storing it as 0.88 would make an
    // audit of "which reports were borderline" answer a different question than the one asked.
    const tenantId = randomUUID();
    await insert(tenantId, { confidence: 0.875 });
    const rows = await infra.prisma.$queryRawUnsafe<Array<{ confidence: string }>>(
      `SELECT confidence::text FROM ai.ai_generated_reports WHERE tenant_id = $1::uuid`,
      tenantId,
    );
    expect(rows[0].confidence).toBe('0.875');
  });

  it('carries the (project_id, report_type, generated_at DESC) index master names', async () => {
    // /reports/history is "this project's reports of this type, newest first" — the index is that
    // query written down.
    const rows = await infra.prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
      `SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'ai' AND tablename = 'ai_generated_reports'`,
    );
    expect(
      rows.some((r) => /\(project_id,\s*report_type,\s*generated_at DESC\)/.test(r.indexdef)),
    ).toBe(true);
  });

  it('is tenant-isolated in the canonical PERMISSIVE form', async () => {
    const rows = await infra.prisma.$queryRawUnsafe<
      Array<{ policyname: string; permissive: string; roles: string; qual: string; wc: string }>
    >(
      `SELECT policyname, permissive, array_to_string(roles, ',') AS roles,
              COALESCE(qual,'') AS qual, COALESCE(with_check,'') AS wc
         FROM pg_policies WHERE schemaname = 'ai' AND tablename = 'ai_generated_reports'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].policyname).toBe('rls_tenant_isolation');
    expect(rows[0].permissive).toBe('PERMISSIVE');
    expect(rows[0].roles).toBe('app_user');
    expect(rows[0].qual).toContain('NULLIF');
    expect(rows[0].wc).toContain('app.current_tenant_id');
  });

  it('FORCEs row level security', async () => {
    const rows = await infra.prisma.$queryRawUnsafe<
      Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>
    >(
      `SELECT relrowsecurity, relforcerowsecurity
         FROM pg_class WHERE oid = 'ai.ai_generated_reports'::regclass`,
    );
    expect(rows[0].relrowsecurity).toBe(true);
    expect(rows[0].relforcerowsecurity).toBe(true);
  });

  it('accepts a full report row and returns it intact', async () => {
    const tenantId = randomUUID();
    await insert(tenantId);
    const rows = await infra.prisma.$queryRawUnsafe<
      Array<{ report_type: string; content: Record<string, unknown>; tokens_used: number }>
    >(
      `SELECT report_type::text, content, tokens_used
         FROM ai.ai_generated_reports WHERE tenant_id = $1::uuid`,
      tenantId,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].report_type).toBe('SITE_SUMMARY');
    expect(rows[0].content).toMatchObject({ summary: 'a summary' });
    expect(Number(rows[0].tokens_used)).toBe(1234);
  });
});
