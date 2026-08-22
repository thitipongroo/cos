-- Rollback: 20260822000003_safety_violation_event
--
-- Removes the system templates for safety.violation.detected.v1.
--
-- The producers are application code and are NOT reverted here. With the templates gone,
-- NotificationService finds no template for either channel and skips delivery silently
-- (`if (!template) continue`) — so violations would be emitted, consumed, and never surfaced to
-- anyone. That is the pre-2026-08-22 behaviour in everything but name, and it is invisible: no error,
-- no log at the skip site. Revert the producers in the same step, or do not run this.
--
-- Targets system rows only (tenant_id IS NULL): a tenant that has authored its own override for this
-- event type keeps it.

DELETE FROM notifications.notification_templates
WHERE tenant_id IS NULL
  AND event_type = 'safety.violation.detected.v1';
