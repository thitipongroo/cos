-- Rollback: 20260730000002_add_user_additional_roles
-- Reverses: migrations/20260730000002_add_user_additional_roles/migration.sql
--
-- The migration creates one table and one index on it. DROP TABLE removes the index with the table;
-- the index is dropped explicitly first so a partially-applied migration (table absent, index
-- present — not reachable here, but cheap to cover) also cleans up. IF EXISTS on both keeps this
-- idempotent (§9.7.1).
--
-- WARNING: drops every ADDITIONAL role grant. Each user keeps the primary role in
-- platform.tenant_memberships, so nobody loses access entirely — but anyone who relied on a
-- secondary role loses those permissions, since effective permissions are the union across primary
-- and additional roles. Export platform.user_additional_roles before running.
--
-- NOTE: no additional-roles table appears in `11-database-schema` §11.1, and §6.4 / ADR-014 describe
-- one role per membership. Recorded as OQ-8 in
-- `docs/architecture/technical-design/phase-02-auth-tenant-system.md`; this rollback reverses the migration as
-- committed and takes no position on whether the table should exist.

DROP INDEX IF EXISTS platform.idx_user_additional_roles_user;

DROP TABLE IF EXISTS platform.user_additional_roles CASCADE;
