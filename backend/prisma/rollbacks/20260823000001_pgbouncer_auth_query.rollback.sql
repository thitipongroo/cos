-- Rollback for 20260823000001_pgbouncer_auth_query (TDD OQ-53).
--
-- ⚠️ RUNNING THIS BREAKS EVERY CONNECTION THROUGH PGBOUNCER. `auth_query` is how PgBouncer learns a
-- connecting user's password hash; without the function it can authenticate nobody, and QM-18 puts
-- PgBouncer in front of every service. Revert `pgbouncer.ini` to a working auth method FIRST —
-- either by restoring an `auth_file` mount or by pointing the pooler straight at PostgreSQL — and
-- only then run this.
--
-- The order below matters: the grant goes before the function it is on, and the role last, because
-- a role cannot be dropped while it still holds a privilege.

REVOKE EXECUTE ON FUNCTION public.pgbouncer_get_auth(TEXT) FROM pgbouncer_auth;
DROP FUNCTION IF EXISTS public.pgbouncer_get_auth(TEXT);

-- Whichever database this is being rolled back in — the forward migration granted it the same
-- way. A literal name here would fail with SQLSTATE 3D000 in every database but one, and a
-- rollback that errors is worse than one that does nothing: it stops before the statements
-- below it.
DO $$
BEGIN
  EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM pgbouncer_auth', current_database());
END $$;

-- Left in place deliberately: a role can own objects or appear in another database's grants, and
-- DROP ROLE fails on either. Drop it by hand once you have confirmed it holds nothing:
--   DROP ROLE IF EXISTS pgbouncer_auth;
