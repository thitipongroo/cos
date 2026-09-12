-- platform.users.password_changed_at — when this account's password was last set.
--
-- WHY THIS COLUMN EXISTS
-- ----------------------
-- The Account Settings drawing puts "Last changed 3 months ago" under the Password row, and nothing
-- in this database could answer it: a grep for `password_changed_at` / `password_updated_at` over
-- the whole schema returned zero rows before this migration. The row was one of six escalations on
-- the 2026-09-12 plan; the product owner chose to build self-service password change rather than
-- drop the row, and this column is the half of that decision the database owns.
--
-- NULLABLE, AND NULL IS THE ORDINARY CASE
-- ---------------------------------------
-- Every account that exists today has never changed its password through a path this codebase
-- observes, so every existing row is NULL after this migration and stays NULL until its owner
-- changes their password. The surface reads that as "no date to show" and prints nothing — never
-- "never", which would be a claim about the credential's history that this column cannot support.
--
-- WHAT IT DOES NOT KNOW, STATED PLAINLY
-- -------------------------------------
-- Keycloak is the credential store; this column is a local observation of the writes that pass
-- through this API. Two paths change a password WITHOUT touching it:
--
--   * `sendPasswordResetEmail` (keycloak-admin.service.ts) hands the user a Keycloak reset link. The
--     change happens inside Keycloak, on its own page, and nothing calls back here.
--   * A realm administrator changing a credential in the Keycloak console directly.
--
-- So the column is a LOWER BOUND on recency, not an audit record. It is written by the two paths
-- that do run through this service — self-service change and admin temporary reset — because both
-- genuinely set the credential, and a row that ignored the admin reset would report a password as
-- older than it is. Anything that needs a true credential history reads Keycloak, not this column.
--
-- NOT A SECURITY CONTROL. Nothing expires a password on it, nothing blocks a login by it, and no
-- policy reads it. It exists to date a line of text. If a rotation policy is ever wanted, that is a
-- separate decision with its own enforcement point — this column would be an input to it, not it.
--
-- TIMESTAMPTZ, matching `last_seen_at` / `created_at` / `updated_at` on this table rather than a
-- bare DATE: the other four timestamps here are all zone-aware and one column that is not is the
-- kind of difference that gets discovered by a bug.
ALTER TABLE platform.users
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN platform.users.password_changed_at IS
  'When the password was last set through this API (self-service change or admin temporary reset). NULL = never observed. A lower bound on recency, not an audit record — Keycloak-side changes do not update it.';
