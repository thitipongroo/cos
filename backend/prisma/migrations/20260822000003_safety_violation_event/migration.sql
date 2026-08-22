-- Notification templates for safety.violation.detected.v1 (§19.6, §20.2 — TDD OQ-35).
--
-- `19-notification-architecture` §19.6: "Critical safety notifications (SafetyIncidentReported,
-- SafetyViolationDetected) cannot be disabled." The second of those two had NO producer, no
-- consumer, and no entry in §32.4's event catalogue — it appeared in §19.6 and in
-- `16-enterprise-event-flow` §16 and nowhere else. So the un-disableable set had an unknown size,
-- and `/safety/compliance` was the only surface that knew anything about violations, in pull form.
--
-- Two producers now emit it (product-owner decision 2026-08-22):
--   PERMIT_EXPIRED        — PermitExpiryService's hourly sweep
--   CHECKLIST_ITEM_FAILED — SiteOpsService.submitInspection, on a FAILED safety checklist
--
-- IN_APP and EMAIL only: the Expo push §20.2 wants is sent from inside dispatch()'s IN_APP branch,
-- so a PUSH-channel row would be read by nothing (NotificationService.CHANNELS is IN_APP/EMAIL/LINE).
--
-- NOT EXISTS rather than ON CONFLICT: the unique constraint is (tenant_id, event_type, channel) and
-- tenant_id is NULL for a system template, and PostgreSQL treats NULLs as distinct — ON CONFLICT
-- would not deduplicate on a re-run.
--
-- Rollback: rollbacks/20260822000003_safety_violation_event.rollback.sql

INSERT INTO notifications.notification_templates
  (tenant_id, event_type, channel, subject_template, body_template, is_active)
SELECT v.tenant_id, v.event_type, v.channel::notifications."NotificationChannel",
       v.subject_template, v.body_template, true
FROM (VALUES
  (NULL::uuid, 'safety.violation.detected.v1', 'IN_APP',
   'Safety violation detected',
   '{{detail}}'),
  (NULL::uuid, 'safety.violation.detected.v1', 'EMAIL',
   'Safety violation detected — {{violation_type}}',
   '{{detail}}

This alert cannot be switched off: §19.6 classifies safety violations as critical safety notifications.')
) AS v(tenant_id, event_type, channel, subject_template, body_template)
WHERE NOT EXISTS (
  SELECT 1 FROM notifications.notification_templates t
  WHERE t.tenant_id IS NULL
    AND t.event_type = v.event_type
    AND t.channel = v.channel::notifications."NotificationChannel"
);
