-- Rollback for 20260825000003_safety_violation_notification_template.
-- Removes the system-default template. NOTE: with it gone the event is routed but never delivered —
-- notifyUser drops any channel with no template — which §19.6 forbids for this event specifically.
DELETE FROM notifications.notification_templates
WHERE tenant_id IS NULL
  AND event_type = 'safety.violation.detected.v1';
