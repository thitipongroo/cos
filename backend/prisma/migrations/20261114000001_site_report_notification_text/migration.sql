-- The site-report IN_APP notification stops stating attachment counts it cannot know.
--
-- 20260824000002 gave site.report.created.v1 the body "… ({{issue_count}} issue(s), {{photo_count}} photo(s);
-- report {{report_id}})". The event is written when the report is, and at that moment a report's issues and photos
-- almost never exist yet: the app uploads photos after the report has synced, and issues are linked to it later. So
-- every project manager read "0 issue(s), 0 photo(s)" — a count that was wrong as soon as they arrived. (The event comes
-- from the web POST /site/reports only; reports synced from the app emit site.report.submitted.v1, which is not routed
-- to notifications.)
-- (Product owner, 2026-11-14: take the counts out of the text; the event keeps its fields.)
--
-- LANGUAGE (QM-3): Thai, a blank line, then English, as the trial notices (20261101000002); the old body was English
-- only. The subject carries both, separated by " / ".
--
-- Only the system row (tenant_id IS NULL). A tenant's own template for this event is theirs and is left as it is.
-- Idempotent: an UPDATE of one row to fixed text.
--
-- Rollback: rollbacks/20261114000001_site_report_notification_text.rollback.sql

UPDATE notifications.notification_templates
   SET subject_template = 'ส่งรายงานหน้างานประจำวันแล้ว / Daily site report submitted',
       body_template    = 'รายงานหน้างานวันที่ {{report_date}} ของโครงการ {{project_id}} ส่งโดย {{submitted_by}}: {{summary}} (รายงาน {{report_id}})

A site report for {{report_date}} on project {{project_id}} was submitted by {{submitted_by}}: {{summary}} (report {{report_id}}).'
 WHERE tenant_id IS NULL
   AND event_type = 'site.report.created.v1'
   AND channel = 'IN_APP';
