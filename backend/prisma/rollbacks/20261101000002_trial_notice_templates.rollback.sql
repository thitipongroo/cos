-- Rollback for 20261101000002_trial_notice_templates.
--
-- Only the system rows (tenant_id IS NULL) this migration inserted; a tenant's own template for a notice is kept.
-- Roll the backend back first: with the rows gone the trial job's notices render nothing and send nothing.

DELETE FROM notifications.notification_templates
 WHERE tenant_id IS NULL
   AND event_type LIKE 'tenant.trial.notice.%';
