-- pgbouncer_auth — the role PgBouncer uses to look up password hashes (TDD OQ-53).
--
-- WHY THIS EXISTS. QM-18 requires PgBouncer between every service and PostgreSQL, but the committed
-- manifest could not start: `pgbouncer.ini` set `auth_type = scram-sha-256` with
-- `auth_file = /etc/pgbouncer/userlist.txt`, and `/etc/pgbouncer` is mounted read-only from a
-- ConfigMap whose only key is `pgbouncer.ini`. The auth file was never going to exist at that path,
-- so PgBouncer could authenticate nobody. The file itself holds password hashes and is
-- cluster-specific, so committing it was never an option either.
--
-- `auth_query` removes the file. PgBouncer connects as ONE role and asks PostgreSQL for the hash of
-- whichever user is connecting, so adding an application role needs no config change and no
-- redeploy — which matters here, where `app_user` and `cos` are already two roles and dedicated
-- ENTERPRISE databases add more (PO decision 2026-08-23).
--
-- WHY A FUNCTION RATHER THAN `SELECT ... FROM pg_shadow`. Reading `pg_shadow` requires superuser.
-- Pointing `auth_query` straight at it would mean PgBouncer connecting as a superuser — which is the
-- opposite of what `app_user` exists for (migration 20260623000001: the application connects as a
-- NON-superuser precisely so RLS is enforced, because owners and superusers bypass it). A
-- SECURITY DEFINER function lets a non-privileged role read exactly one thing: one user's hash, by
-- name, and nothing else.
--
-- The function is deliberately narrow:
--   * `SECURITY DEFINER` with a pinned `search_path`, so a caller cannot shadow `pg_shadow` with a
--     table of their own and have the definer read that instead.
--   * EXECUTE revoked from PUBLIC and granted only to `pgbouncer_auth`.
--   * `pgbouncer_auth` gets no other grant at all — it cannot read a single application table.

CREATE OR REPLACE FUNCTION public.pgbouncer_get_auth(p_usename TEXT)
  RETURNS TABLE (usename NAME, passwd TEXT)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT usename, passwd FROM pg_catalog.pg_shadow WHERE usename = p_usename;
$$;

-- NOLOGIN on purpose. The role must exist for the GRANT below, but a login role whose password is
-- set by a migration would carry that password into every environment restored from these
-- migrations. Ops gives it one from Vault / AWS Secrets Manager (spec §5.2, QM-4):
--
--   ALTER ROLE pgbouncer_auth WITH LOGIN PASSWORD '<from secret store>';
--
-- Local dev gets the password below, matching how 20260623000001 treats app_user — never use it
-- outside local dev.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'pgbouncer_auth') THEN
    CREATE ROLE pgbouncer_auth NOLOGIN;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.pgbouncer_get_auth(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pgbouncer_get_auth(TEXT) TO pgbouncer_auth;

-- CONNECT is required as well: auth_query runs on a real connection to this database.
GRANT CONNECT ON DATABASE construction_os TO pgbouncer_auth;
