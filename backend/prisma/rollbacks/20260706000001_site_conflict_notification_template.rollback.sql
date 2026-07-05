-- Rollback for 20260706000001_site_conflict_notification_template (QM-9).
-- Removes the system-wide default IN_APP template for site.conflict.flagged.v1.

DELETE FROM notifications.notification_templates
WHERE tenant_id IS NULL
  AND event_type = 'site.conflict.flagged.v1'
  AND channel = 'IN_APP';
