-- Rollback for 20260831000001_safety_compliance_failed_notification_template.
--
-- Only the system rows (tenant_id IS NULL) this migration inserted. A tenant that has since written
-- its OWN template for the event keeps it: those rows carry a tenant_id and were never ours.

DELETE FROM notifications.notification_templates
 WHERE tenant_id IS NULL
   AND event_type = 'safety.compliance.failed.v1';
