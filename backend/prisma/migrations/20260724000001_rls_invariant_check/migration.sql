-- RLS invariant (security review L6): every table carrying a tenant_id column in a DOMAIN schema MUST
-- have Row Level Security enabled. Enforced at migrate time so a future migration that adds a tenant
-- table without RLS fails `migrate deploy` rather than silently shipping an unprotected table (the RLS
-- DO-loops in earlier migrations are one-time snapshots — a later migration that forgets to enable RLS
-- on a new table would otherwise go unnoticed).
--
-- The `platform` schema is EXCLUDED: it deliberately holds cross-tenant tables that are RLS-exempt by
-- design — vendor_identities / vendor_trading_relationships (network tables), otp_audit (pre-auth),
-- outbox_events (publisher-only). Domain schemas have no such exemptions, so any tenant_id table there
-- lacking RLS is a bug.
--
-- Extension-owned tables are ALSO excluded (pg_depend deptype 'e'): they are not application domain
-- tables and the app can neither own nor meaningfully enable RLS on an extension's internal catalog.
-- TimescaleDB 2.29 added `_timescaledb_catalog.continuous_aggs_tenant_tracking`, which carries its own
-- `tenant_id` column; without this exclusion the invariant fires on the extension's catalog instead of
-- our schemas (the failure is version-triggered because the test image floats on `:latest`). Excluding
-- by extension membership — rather than hard-coding TimescaleDB's schema names — keeps the check robust
-- against any extension while still catching every unprotected tenant_id table in our own schemas.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    WHERE c.column_name = 'tenant_id'
      AND c.table_schema NOT IN ('platform', 'pg_catalog', 'information_schema')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_class pc
        JOIN pg_namespace pn ON pn.oid = pc.relnamespace
        JOIN pg_depend dep ON dep.objid = pc.oid AND dep.deptype = 'e'
        WHERE pn.nspname = c.table_schema AND pc.relname = c.table_name
      )
    GROUP BY c.table_schema, c.table_name
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = t.table_schema
        AND c.relname = t.table_name
        AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION
        'RLS invariant violated: %.% has a tenant_id column but Row Level Security is not enabled',
        t.table_schema, t.table_name;
    END IF;
  END LOOP;
END $$;
