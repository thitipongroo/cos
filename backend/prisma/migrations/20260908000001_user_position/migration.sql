-- platform.users.position — the person's job title, as they would say it themselves.
--
-- WHY THIS COLUMN EXISTS
-- ----------------------
-- The mobile drawer's profile block reads NAME · POSITION · ID (spec §32.7 "Drawer Profile Block").
-- The position line had no column behind it and was DRAWN: `PROFILE_JOB_TITLE` in
-- `apps/mobile/src/lib/mockupFigures.ts`, one hardcoded string — "Lead Controller" — rendered
-- unconditionally for every role. ADR-099 amendment 4 recorded the gap and named this column as the
-- thing that would close it. ADR-101 is the decision itself.
--
-- WHY NOT workforce.workers.trade_type
-- ------------------------------------
-- It is the nearest existing field and it is the wrong one. `trade_type` is a SITE TRADE —
-- electrician, steel fixer — and the link `workforce.workers.user_id` is nullable and mostly NULL:
-- in the seeded dev tenant exactly 1 of 19 workers is attached to an account, because office roles
-- (finance, project managers, tenant admins) have no worker record at all. Those are precisely the
-- accounts whose drawer needed a title.
--
-- SHAPED AFTER department, DELIBERATELY
-- -------------------------------------
-- `department VARCHAR(255) NULL` is the existing free-text HR column on this table, and this one
-- copies it exactly: same type, same nullability, no default, no constraint, no index. An account is
-- created before anyone knows the person's title — `UserService.create` provisions Keycloak and
-- inserts a row from an email and a role — so NOT NULL would mean inventing a value at signup, which
-- is the failure this column exists to end.
--
-- NOT AN AUTHORISATION INPUT. Like `department`, it is free text for display. The role is in
-- `platform.tenant_memberships.role` and stays the only thing anything checks.
--
-- "position" IS SAFE AS A COLUMN NAME HERE, AND IT WAS TESTED RATHER THAN ASSUMED. Postgres lists
-- POSITION as reserved-but-usable-as-a-column: `CREATE TEMP TABLE kwtest (position VARCHAR(255))`
-- succeeds, and `SELECT k.position, position('b' in 'abc') FROM kwtest k` returns both the column
-- and the built-in in one statement. Queries in this codebase qualify the column (`u.position`), so
-- the two never meet.
ALTER TABLE platform.users
  ADD COLUMN IF NOT EXISTS position VARCHAR(255) NULL;

COMMENT ON COLUMN platform.users.position IS
  'Job title, free text, for display. Not a role and not an authorisation input (ADR-101).';
