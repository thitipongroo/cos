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
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE column_name = 'tenant_id'
      AND table_schema NOT IN ('platform', 'pg_catalog', 'information_schema')
    GROUP BY table_schema, table_name
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
