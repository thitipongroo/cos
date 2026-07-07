-- Rollback for 20260707000003_issue_escalated_notification_template (QM-9).
-- Removes the system-wide default IN_APP template for site.issue.escalated.v1.
DELETE FROM notifications.notification_templates
WHERE tenant_id IS NULL
  AND event_type = 'site.issue.escalated.v1'
  AND channel = 'IN_APP';
