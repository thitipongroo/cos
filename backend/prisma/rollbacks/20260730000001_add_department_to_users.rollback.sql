-- Rollback: 20260730000001_add_department_to_users
-- Reverses: migrations/20260730000001_add_department_to_users/migration.sql
--
-- One nullable column, no backfill, no constraint — dropping it restores the prior schema exactly.
-- IF EXISTS keeps this idempotent (§9.7.1).
--
-- WARNING: drops every recorded department. The value is not read by any tenant-isolation or
-- authorization path, so removing it does not change access decisions.
--
-- NOTE: `platform.users.department` is not in `11-database-schema` §11.1, which gives the table ten
-- columns and none of them this. The only `department` in the specification set is on the Employee
-- entity (§11.2, workforce master) — a different entity. Recorded as OQ-8 in
-- `docs/technical-design/phase-02-auth-tenant-system.md`; this rollback reverses the migration as
-- committed and takes no position on whether the column should exist.

ALTER TABLE platform.users
  DROP COLUMN IF EXISTS department;
