-- site_ops foreign keys — the eight relationships master:2662-2714 declares and the schema never had.
--
-- WHY. Every one of these columns is written "FK" in the spec, and none of them was a constraint.
-- site_ops held five foreign keys before this migration, none of them on its four core tables, so
-- this is an omission rather than a policy: `site_ops.carbon_records.project_id` already references
-- `projects.projects` across schemas, and eight constraints elsewhere in the database point at that
-- same table. Nothing anywhere forbids cross-schema references.
--
-- What it costs to be without them is sharpest at the task completion gates (master:2639-2643),
-- which decide whether work may be closed by COUNTing rows whose task_id matches. A task_id that
-- points at a task that does not exist counts zero — indistinguishable from "nothing is blocking
-- this" — so a task could close with an open DEFECT attached to it through a stale reference.
--
-- ON DELETE, chosen to match what each column means rather than applied uniformly:
--   project_id    NOT NULL  -> RESTRICT. A project with site records cannot be deleted out from
--                              under them; the rows have nowhere to belong.
--   report_id     optional  -> SET NULL. An issue outlives the daily report it was first noted on.
--                              Mirrors site_ops.material_consumptions.report_id, already SET NULL.
--   task_id       nullable  -> SET NULL. Deleting a task must not delete the defect found doing it,
--                              and the gates read a NULL task_id as "not linked", which is true.
--   checklist_id  NOT NULL  -> RESTRICT. An inspection is the record of a specific checklist; with
--                              the checklist gone the answers mean nothing.
--
-- ADDED NOT VALID, THEN VALIDATED SEPARATELY. `ADD CONSTRAINT ... NOT VALID` takes a brief lock and
-- enforces the constraint on every new and updated row immediately; `VALIDATE CONSTRAINT` then
-- checks the rows already there under a weaker lock that does not block reads or writes. On a table
-- of any size the one-step form holds ACCESS EXCLUSIVE for the whole scan. If validation fails, it
-- fails loudly on pre-existing orphans — which is the right outcome: they are exactly the rows the
-- constraint exists to make impossible, and they should be reconciled, not grandfathered in.
--
-- QM-9: additive only. Rollback drops the eight constraints and the one index, restoring the prior
-- state exactly — see prisma/rollbacks/20260822000002_site_ops_foreign_keys.rollback.sql.

-- The FK's delete-side check scans the referencing column; every other column below already leads an
-- index (idx_issues_task, idx_inspections_checklist, idx_*_project_tenant). This one did not, so
-- deleting a site report would have meant a sequential scan of site_ops.issues.
CREATE INDEX IF NOT EXISTS idx_issues_report ON site_ops.issues (report_id);

ALTER TABLE site_ops.site_reports
  ADD CONSTRAINT site_reports_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects.projects(project_id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE site_ops.issues
  ADD CONSTRAINT issues_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects.projects(project_id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE site_ops.issues
  ADD CONSTRAINT issues_report_id_fkey
  FOREIGN KEY (report_id) REFERENCES site_ops.site_reports(report_id) ON DELETE SET NULL NOT VALID;

ALTER TABLE site_ops.issues
  ADD CONSTRAINT issues_task_id_fkey
  FOREIGN KEY (task_id) REFERENCES projects.tasks(task_id) ON DELETE SET NULL NOT VALID;

ALTER TABLE site_ops.inspections
  ADD CONSTRAINT inspections_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects.projects(project_id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE site_ops.inspections
  ADD CONSTRAINT inspections_checklist_id_fkey
  FOREIGN KEY (checklist_id) REFERENCES site_ops.safety_checklists(checklist_id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE site_ops.inspections
  ADD CONSTRAINT inspections_task_id_fkey
  FOREIGN KEY (task_id) REFERENCES projects.tasks(task_id) ON DELETE SET NULL NOT VALID;

ALTER TABLE site_ops.safety_checklists
  ADD CONSTRAINT safety_checklists_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects.projects(project_id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE site_ops.site_reports       VALIDATE CONSTRAINT site_reports_project_id_fkey;
ALTER TABLE site_ops.issues             VALIDATE CONSTRAINT issues_project_id_fkey;
ALTER TABLE site_ops.issues             VALIDATE CONSTRAINT issues_report_id_fkey;
ALTER TABLE site_ops.issues             VALIDATE CONSTRAINT issues_task_id_fkey;
ALTER TABLE site_ops.inspections        VALIDATE CONSTRAINT inspections_project_id_fkey;
ALTER TABLE site_ops.inspections        VALIDATE CONSTRAINT inspections_checklist_id_fkey;
ALTER TABLE site_ops.inspections        VALIDATE CONSTRAINT inspections_task_id_fkey;
ALTER TABLE site_ops.safety_checklists  VALIDATE CONSTRAINT safety_checklists_project_id_fkey;
