-- Record WHO raised an issue, so a PDPA §30 export can attribute it (ADR-078).
--
-- Until now `assigned_to` was the only user column on site_ops.issues, so an issue the subject
-- raised but was never assigned to them was invisible to their own subject-rights request — while
-- the row carries latitude/longitude, i.e. a record of where that person physically stood.
--
-- The value was never missing, only unpersisted: SiteOpsService.createIssue already holds
-- `this.userId` and puts it in the site.issue.created.v1 event payload as `created_by`. This column
-- writes it to the row as well.
--
-- Backward-compatible (QM-9): nullable and additive, so deployed code keeps working unchanged.
--
-- NO BACKFILL IS POSSIBLE, and none is attempted. platform.audit_logs records `actor_id` and
-- `resource_type` but no resource_id (see audit.interceptor.ts), so "user X created an issue" cannot
-- be matched to WHICH issue. platform.outbox_events holds the creator in its payload but is a
-- transient publish queue, not an event store. Guessing a creator would attribute someone's site
-- location to the wrong person, so pre-existing rows keep NULL and every export states that the
-- column only covers issues created from this migration onward.
-- Rollback: prisma/rollbacks/20260804000004_issues_created_by.rollback.sql

ALTER TABLE site_ops.issues
  ADD COLUMN IF NOT EXISTS created_by UUID;

-- The export filters on this column for one user across the whole table; without an index that is a
-- sequential scan of every issue in the tenant on each subject-rights request.
CREATE INDEX IF NOT EXISTS idx_issues_created_by
  ON site_ops.issues (created_by);

-- assigned_to is the other export predicate and was never indexed either — the same scan, on the
-- path that already exists today.
CREATE INDEX IF NOT EXISTS idx_issues_assigned_to
  ON site_ops.issues (assigned_to);
