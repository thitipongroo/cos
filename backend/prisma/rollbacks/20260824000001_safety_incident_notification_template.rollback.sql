-- Rollback for 20260824000001_safety_incident_notification_template.
-- Removes the system-wide default IN_APP template for safety.incident.created.v1.
DELETE FROM notifications.notification_templates
WHERE tenant_id IS NULL
  AND event_type = 'safety.incident.created.v1'
  AND channel = 'IN_APP';
