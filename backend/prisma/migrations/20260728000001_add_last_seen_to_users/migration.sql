-- Last-seen tracking for platform.users (Tenant Admin "User Audit" — mockup 04_tenant_admin/02_users).
-- Updated fire-and-forget (throttled 15 min/user) in JwtAuthGuard on every authenticated request, so it
-- captures activity from BOTH auth paths — Path A (phone OTP, backend-issued) and Path B (email/OIDC,
-- exchanged mobile↔Keycloak) — unlike a login-only hook, which the backend never sees for the browser
-- OIDC flow. The User Audit card flags users whose last_seen_at is older than 30 days.
--
-- NOT NULL DEFAULT now() keeps the add backward-compatible (QM-9): existing rows are treated as seen at
-- migration time (we have no history), so nobody is falsely flagged inactive at launch; the signal grows
-- meaningful as real activity updates the column. platform.users already enforces RLS (tenant isolation)
-- — adding a column does not change any policy.

ALTER TABLE platform.users
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();
