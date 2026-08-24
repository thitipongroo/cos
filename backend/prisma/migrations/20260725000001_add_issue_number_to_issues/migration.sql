-- Add a human-readable issue_number to site_ops.issues — ISS-<year>-<seq>, unique per tenant
-- (ADR-069). Mirrors procurement.purchase_requests.pr_number: a per-tenant, per-year running number
-- derived from MAX(existing)+1 (not a DB sequence), so it restarts each January and stays per-tenant.
--
-- Backward-compatible (QM-9): the column is nullable, so every pre-existing issue keeps a NULL number
-- and no deployed code breaks; the unique index permits multiple NULLs (Postgres semantics), and new
-- issues get a number generated at create time (SiteOpsService.createIssue).
-- Rollback: prisma/rollbacks/20260725000001_add_issue_number_to_issues.rollback.sql

ALTER TABLE site_ops.issues
  ADD COLUMN IF NOT EXISTS issue_number VARCHAR(50);

-- The constraint doing the real concurrency work: two offline issues syncing at once can both compute
-- the same MAX+1, and the second INSERT then fails here rather than duplicating a number within the
-- tenant (mirrors uq_pr_tenant_number). Multiple NULLs are allowed, so pre-existing rows never collide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_issues_tenant_number
  ON site_ops.issues (tenant_id, issue_number);
