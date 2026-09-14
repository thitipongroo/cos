-- platform.tenants.keycloak_realm — UNIQUE for every realm except the shared realm `construction-os`
-- (product-owner decisions 2026-09-14).
--
-- WHAT WAS WRONG
-- --------------
-- 20260531000001_platform_schema declared `CONSTRAINT tenants_keycloak_realm_key UNIQUE (keycloak_realm)`.
-- TenantService.createTenant gives every STARTER and PROFESSIONAL tenant the SHARED realm
-- `construction-os`, as spec §7.6 step 3 requires ("shared realm for SMB/mid-market; dedicated realm
-- created for enterprise"). The two cannot both hold: the first small tenant takes the shared realm and
-- every later one fails with `duplicate key value violates unique constraint "tenants_keycloak_realm_key"`
-- (measured 2026-09-14, creating a second small tenant through the SYSTEM_ADMIN panel). §11 said UNIQUE
-- and §7.6 said shared; the specification contradicted itself and the schema followed §11.
--
-- WHAT THIS KEEPS — AND WHY IT IS KEYED ON THE REALM, NOT THE PLAN
-- ----------------------------------------------------------------
-- A realm that is not the shared one belongs to exactly one tenant, and registering it twice must still
-- fail. A first version keyed this on `plan_type = 'ENTERPRISE'`; the Rule 41 review showed that let a
-- STARTER row take an ENTERPRISE tenant's `cos-acme`, and two PROFESSIONAL rows share any non-shared realm
-- (the seeds already put PROFESSIONAL tenants on their own realms). Which plan a tenant is on does not
-- decide whether its realm is shared; the realm's name does. An ENTERPRISE row on `construction-os` is
-- therefore allowed — the case of a tenant upgraded before its dedicated realm exists.
--
-- DEPLOY ORDER — THE BACKEND FIRST, THIS MIGRATION SECOND
-- -------------------------------------------------------
-- Once the shared realm holds two tenants, the realm check in KeycloakJwtStrategy no longer separates them;
-- ADR-106 (the token subject bound to the account) does. A backend without ADR-106 running against this
-- schema can be impersonated across small tenants. So the backend carrying ADR-106 is fully rolled out
-- BEFORE this migration runs, and rolling the backend back below ADR-106 requires the rollback SQL first —
-- which refuses once the shared realm holds two tenants.
--
-- BACKWARD-COMPATIBLE (QM-9) in rows: every row the old constraint allowed, this index allows. It is NOT
-- backward-compatible in security for a backend older than ADR-106 — see the deploy order above.
--
-- Prisma's schema language does not model this partial unique index, so schema.prisma no longer declares
-- `@unique` on keycloakRealm and carries a comment naming this index instead. The first partial UNIQUE
-- index kept in raw SQL is `users_phone_number_key` (20260819000001), not this one.

-- CHECKED FIRST, BEFORE ANYTHING IS DROPPED (Rule 41 review, 2026-09-14). The DROP below is IF EXISTS, so it
-- cannot prove the old uniqueness is gone: on a database where it lives as a plain unique index, under
-- another name, as an expression index (`lower(keycloak_realm)`), with a different predicate or with INCLUDE
-- columns, the DROP is a no-op and the bug survives a green migration. So any unique index that mentions
-- keycloak_realm, other than the constraint this migration replaces, refuses the migration — and because
-- nothing has been changed yet, a refusal leaves the table exactly as it was.
DO $$
DECLARE
  other text;
BEGIN
  SELECT string_agg(c.relname, ', ')
    INTO other
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
   WHERE i.indrelid = 'platform.tenants'::regclass
     AND i.indisunique
     AND c.relname <> 'tenants_keycloak_realm_key'
     AND pg_get_indexdef(i.indexrelid) LIKE '%keycloak_realm%';
  IF other IS NOT NULL THEN
    RAISE EXCEPTION 'keycloak_realm is also UNIQUE via: %. Resolve it by hand first.', other;
  END IF;
END $$;

ALTER TABLE platform.tenants DROP CONSTRAINT IF EXISTS tenants_keycloak_realm_key;

-- No IF NOT EXISTS: an index already carrying this name with a different definition must fail the
-- migration, not be silently kept under a name that claims this rule (Rule 41 review, 2026-09-14).
CREATE UNIQUE INDEX tenants_keycloak_realm_dedicated_key
  ON platform.tenants (keycloak_realm)
  WHERE keycloak_realm <> 'construction-os';
