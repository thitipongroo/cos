-- Delta sync could only ever report NEW tasks and NEW incidents (TDD, 2026-08-23).
--
-- `GET /sync/delta` pages each entity with `WHERE {deltaColumn} > $cursor`. Both of these tables
-- had only `created_at`, so that is what the registry used — and `created_at` never changes. Every
-- edit after the row was written was therefore invisible to every device:
--
--   projects.tasks     status, progress_percent, assigned_to  (TasksRepository.updateTask)
--                      progress_percent                       (SyncService.pushTask, max-wins)
--   site_ops.incidents OPEN -> IN_PROGRESS + acknowledged_by  (SafetyRepository.acknowledgeIncident)
--
-- The incident case is the sharper one: a safety officer acknowledges an incident, and it keeps
-- showing as OPEN on every other handset for as long as the row exists. The response field is
-- literally named `updated[]`; for these two types it could only carry insertions.
--
-- The other two `created_at` entities in the registry are correct and are NOT touched here:
-- site_ops.material_consumptions and workforce_telemetry.attendance_logs have no UPDATE path
-- anywhere in the source (§17.5 calls material append-only), so for them created_at IS the
-- modification time.
--
-- BACKFILL IS now(), NOT created_at (product-owner decision 2026-08-23). Devices are currently
-- holding stale status, progress and assignee for every row edited since it was created. Stamping
-- now() makes the next delta pull carry the true current state of every row down once, which
-- repairs that accumulated drift. Backfilling created_at would preserve today's behaviour exactly
-- and leave every historical edit lost on the device until somebody happens to edit that row again.
-- The cost is one page-limited re-pull per device (DELTA_PAGE_SIZE = 500, and the pull resumes past
-- a truncated page), against §17.7's ~500-row ceiling.
--
-- The column is maintained by application code, like every other `modified_at` in this schema
-- (site_ops.site_reports, site_ops.issues, files' photo_annotations). There are no triggers in this
-- database and this migration does not add the first one; `scripts/ci/check-modified-at-writes.mjs`
-- is what stops a future UPDATE from forgetting the column, because a writer that forgets it
-- reintroduces exactly the silent staleness above.

ALTER TABLE projects.tasks
  ADD COLUMN IF NOT EXISTS modified_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE site_ops.incidents
  ADD COLUMN IF NOT EXISTS modified_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- The delta query is `WHERE modified_at > $1 ORDER BY modified_at ASC LIMIT 500`, run on every
-- device wake. Neither table is indexed on its delta column today — site_reports and issues are not
-- either — but those two are read the same way, so the ordering scan is worth avoiding here while
-- the tables are still small enough for the index build to be free.
CREATE INDEX IF NOT EXISTS tasks_tenant_modified_idx
  ON projects.tasks (tenant_id, modified_at);

CREATE INDEX IF NOT EXISTS incidents_tenant_modified_idx
  ON site_ops.incidents (tenant_id, modified_at);
