-- Purge one ended free-trial tenant's data from PostgreSQL (spec §7.10, ADR-109).
-- Run ONLY as step 4 of docs/runbooks/trial-tenant-deletion.md — the runbook covers MinIO, OpenSearch, Keycloak
-- and Kafka, which this file does not touch.
--
--   psql "$PURGE_DATABASE_URL" -v tenant_id=<uuid> -v mode=dry-run \
--        -v actor_id=<uuid> -v justification='...' -f scripts/maintenance/trial-tenant-purge.sql
--   psql "$PURGE_DATABASE_URL" -v tenant_id=<uuid> -v mode=delete \
--        -v actor_id=<uuid> -v justification='...' -f scripts/maintenance/trial-tenant-purge.sql
--
-- actor_id is the platform.users id of the SYSTEM_ADMIN running it, justification the reason (10–500 characters, as
-- every SYSTEM_ADMIN action requires — §6.7). A delete writes one platform.audit_logs row, action
-- 'tenant.trial_purge', in the same transaction: a purge that cannot be audited does not happen.
--
-- REFUSES unless the tenant is PENDING_DELETION (so never a paying tenant, never a trial still running) and none of
-- its files is under legal hold (files.files.legal_hold, data-retention-policy § Legal hold).
--
-- WHAT IT KEEPS, and why (docs/policies/data-retention-policy.md § Free-trial tenants):
--   platform.tenants          the row, deactivated — audit_logs and the users below reference it
--   platform.audit_logs       compliance audit trail, 7 years
--   platform.users            the rows, ANONYMISED per § Anonymization standard — audit_logs.actor_id references them
--   platform.consents, platform.subject_requests, platform.export_requests
--                             the record that data-subject rights were handled (PDPA); no content
-- Everything else carrying this tenant_id, in every schema, is deleted.
--
-- dry-run prints a row count per table and changes nothing. delete runs in ONE transaction: any failure rolls back
-- every table. Foreign keys between tenant tables are handled by retrying in passes until a pass deletes nothing.
-- tenant_id is compared as text: most tables hold a uuid, a few (the outbox) hold text.

\set ON_ERROR_STOP on
SELECT set_config('cos.purge_tenant', :'tenant_id', false) IS NOT NULL AS tenant_set,
       set_config('cos.purge_mode', :'mode', false) IS NOT NULL AS mode_set,
       set_config('cos.purge_actor', :'actor_id', false) IS NOT NULL AS actor_set,
       set_config('cos.purge_justification', :'justification', false) IS NOT NULL AS justification_set;

BEGIN;

DO $$
DECLARE
  tid    uuid := current_setting('cos.purge_tenant')::uuid;
  mode   text := current_setting('cos.purge_mode');
  keep   text[] := ARRAY['platform.tenants', 'platform.audit_logs', 'platform.users', 'platform.consents',
                         'platform.subject_requests', 'platform.export_requests'];
  actor  uuid := current_setting('cos.purge_actor')::uuid;
  why    text := btrim(current_setting('cos.purge_justification'));
  counts jsonb := '{}'::jsonb;
  status text;
  t      record;
  n      bigint;
  pass   int := 0;
  deleted_this_pass bigint;
  remaining text[];
BEGIN
  IF mode NOT IN ('dry-run', 'delete') THEN
    RAISE EXCEPTION 'mode must be dry-run or delete, got %', mode;
  END IF;
  IF char_length(why) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'purge refused: justification must be 10-500 characters (§6.7)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM platform.users u JOIN platform.tenant_memberships m USING (user_id)
     WHERE u.user_id = actor AND u.is_active AND m.role::text = 'SYSTEM_ADMIN'
  ) THEN
    RAISE EXCEPTION 'purge refused: actor % is not an active SYSTEM_ADMIN', actor;
  END IF;

  SELECT subscription_status INTO status FROM platform.tenants WHERE tenant_id = tid FOR UPDATE;
  IF status IS NULL THEN
    RAISE EXCEPTION 'purge refused: tenant % does not exist', tid;
  END IF;
  IF status <> 'PENDING_DELETION' THEN
    RAISE EXCEPTION 'purge refused: tenant % is %, not PENDING_DELETION', tid, status;
  END IF;
  IF to_regclass('files.files') IS NOT NULL
     AND EXISTS (SELECT 1 FROM files.files WHERE tenant_id = tid AND legal_hold) THEN
    RAISE EXCEPTION 'purge refused: tenant % has files under legal hold', tid;
  END IF;

  -- Every base table with a tenant_id column, minus the keep list.
  CREATE TEMP TABLE purge_targets ON COMMIT DROP AS
    SELECT format('%I.%I', c.table_schema, c.table_name) AS rel
      FROM information_schema.columns c
      JOIN information_schema.tables tb
        ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
     WHERE c.column_name = 'tenant_id'
       AND c.table_schema NOT IN ('pg_catalog', 'information_schema', '_timescaledb_internal',
                                  '_timescaledb_catalog', '_timescaledb_config', '_timescaledb_cache')
       AND format('%I.%I', c.table_schema, c.table_name) <> ALL (keep);

  IF mode = 'dry-run' THEN
    FOR t IN SELECT rel FROM purge_targets ORDER BY rel LOOP
      EXECUTE format('SELECT count(*) FROM %s WHERE tenant_id::text = $1', t.rel) INTO n USING tid::text;
      IF n > 0 THEN RAISE NOTICE 'would delete % rows from %', n, t.rel; END IF;
    END LOOP;
    SELECT count(*) INTO n FROM platform.users WHERE tenant_id = tid;
    RAISE NOTICE 'would anonymise % platform.users rows; would keep the tenant row (deactivated) and its audit trail', n;
    RETURN;
  END IF;

  -- Passes: a table whose rows are still referenced by another tenant table fails this pass and is retried after
  -- the referencing table has been emptied. Each attempt is its own subtransaction.
  LOOP
    pass := pass + 1;
    deleted_this_pass := 0;
    remaining := ARRAY[]::text[];
    FOR t IN SELECT rel FROM purge_targets ORDER BY rel LOOP
      BEGIN
        EXECUTE format('DELETE FROM %s WHERE tenant_id::text = $1', t.rel) USING tid::text;
        GET DIAGNOSTICS n = ROW_COUNT;
        deleted_this_pass := deleted_this_pass + n;
        IF n > 0 THEN
          RAISE NOTICE 'pass %: deleted % rows from %', pass, n, t.rel;
          counts := counts || jsonb_build_object(t.rel, n);
        END IF;
      EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN
        remaining := remaining || t.rel;
      END;
    END LOOP;
    EXIT WHEN cardinality(remaining) = 0;
    IF deleted_this_pass = 0 THEN
      RAISE EXCEPTION 'purge stuck after % passes; still referenced: %', pass, remaining;
    END IF;
  END LOOP;

  -- Anonymise the accounts (§ Anonymization standard). The rows stay for audit_logs.actor_id.
  UPDATE platform.users
     SET email = 'anonymized-' || user_id || '@cos.invalid',
         display_name = '[ANONYMIZED]',
         phone_number = NULL,
         photo_url = NULL,
         department = NULL,
         position = NULL,
         mfa_totp_secret = NULL,
         mfa_enabled = false,
         is_active = false
   WHERE tenant_id = tid;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'anonymised % platform.users rows', n;

  UPDATE platform.tenants SET is_active = false, updated_at = now() WHERE tenant_id = tid;

  -- §6.7: filed under the TARGET tenant, like every TenantService admin action.
  PERFORM set_config('app.current_tenant_id', tid::text, true);
  INSERT INTO platform.audit_logs (tenant_id, actor_id, action, resource_type, resource_id, metadata)
  VALUES (tid, actor, 'tenant.trial_purge', 'tenant', tid,
          jsonb_build_object('justification', why, 'deleted_rows', counts, 'anonymised_users', n));
  RAISE NOTICE 'tenant % deactivated; purge complete after % passes', tid, pass;
END $$;

COMMIT;
