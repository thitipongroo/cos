-- Rollback: 20260914000001_keycloak_realm_unique_except_shared
--
-- Restores `UNIQUE (keycloak_realm)` across ALL tenants and drops the partial index that exempts the shared realm.
--
-- THIS ROLLBACK FAILS ON PURPOSE ONCE IT IS NO LONGER SAFE. The forward migration exists to let two or
-- more STARTER/PROFESSIONAL tenants share the realm `construction-os` (§7.6). As soon as that has
-- happened, `ADD CONSTRAINT … UNIQUE` cannot be built and PostgreSQL refuses it — which is the right
-- answer: restoring the constraint would require deleting or re-realming live tenants, and a rollback
-- script must not decide that. Resolve the duplicates by hand first:
--
--   SELECT keycloak_realm, count(*) FROM platform.tenants GROUP BY 1 HAVING count(*) > 1;
--
-- With no duplicates it runs cleanly, and TenantService.createTenant goes back to failing on the second
-- small tenant — the state before 2026-09-14.
--
-- BEFORE rolling the backend back below ADR-106, run this first: an older backend cannot tell apart
-- tenants that share a realm (see the forward migration's DEPLOY ORDER).

-- ONE TRANSACTION, CHECKED FIRST (Rule 41 review, 2026-09-14). Run statement by statement, a DROP INDEX
-- that commits before the ADD CONSTRAINT fails leaves the table with NO realm uniqueness at all — worse
-- than either side of this migration. So the duplicate check runs first and aborts with a named message,
-- and the two statements commit together or not at all. Re-runnable: both steps are guarded.

BEGIN;

DO $$
DECLARE
  duplicates text;
BEGIN
  SELECT string_agg(format('%s (%s tenants)', keycloak_realm, n), ', ')
    INTO duplicates
    FROM (SELECT keycloak_realm, count(*) AS n
            FROM platform.tenants GROUP BY keycloak_realm HAVING count(*) > 1) d;
  IF duplicates IS NOT NULL THEN
    RAISE EXCEPTION 'Rollback refused: realms shared by several tenants: %. Re-realm them by hand first.',
      duplicates;
  END IF;
END $$;

DROP INDEX IF EXISTS platform.tenants_keycloak_realm_dedicated_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'tenants_keycloak_realm_key'
       AND conrelid = 'platform.tenants'::regclass
  ) THEN
    ALTER TABLE platform.tenants
      ADD CONSTRAINT tenants_keycloak_realm_key UNIQUE (keycloak_realm);
  END IF;
END $$;

COMMIT;
