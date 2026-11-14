-- Rollback for 20261114000001_site_report_notification_text: the system IN_APP template for
-- site.report.created.v1 goes back to the 20260824000002 text (English only, with the attachment counts).

UPDATE notifications.notification_templates
   SET subject_template = 'Daily site report submitted',
       body_template    = 'A site report for {{report_date}} on project {{project_id}} was submitted by {{submitted_by}}: {{summary}} ({{issue_count}} issue(s), {{photo_count}} photo(s); report {{report_id}}).'
 WHERE tenant_id IS NULL
   AND event_type = 'site.report.created.v1'
   AND channel = 'IN_APP';
