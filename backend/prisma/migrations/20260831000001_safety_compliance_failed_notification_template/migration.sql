-- Notification templates for safety.compliance.failed.v1 (§19.6, §20.2 — TDD OQ-35).
--
-- The platform's own rules finding a safety requirement unmet: an expired permit (PermitExpiryService's
-- hourly sweep) or a failed required checklist item (SiteOpsService.submitInspection). Distinct from
-- safety.violation.detected.v1, which is SafetyVisionModel finding a violation in a photo.
--
-- WHY A SECOND MIGRATION. 20260822000003 seeded these templates under the name this event had until
-- the merge of 2026-08-31: `safety.violation.detected.v1`. That name went to the AI vision event —
-- it had carried it in §16 and §19.6 since before either branch, and two payloads cannot share one
-- subject under BACKWARD_TRANSITIVE — so this payload was renamed and left with no template at all.
-- Those rows stay where they are: they belong to the event that kept the name.
--
-- A routed event with no template notifies NOBODY. `notifyUser` skips each channel at
-- `if (!template) continue`, so the five roles EVENT_ROLE_MAP lists get nothing, and §19.6 classes
-- this event as one that cannot be switched off.
--
-- `{{failure_type}}`, not `{{violation_type}}`: the field was renamed with the event (§32.4 row 23),
-- and a placeholder naming a field that does not exist renders as its own literal text.
--
-- IN_APP and EMAIL only: the Expo push §20.2 wants is sent from inside dispatch()'s IN_APP branch,
-- so a PUSH-channel row would be read by nothing (NotificationService.CHANNELS is IN_APP/EMAIL/LINE).
--
-- NOT EXISTS rather than ON CONFLICT: the unique constraint is (tenant_id, event_type, channel) and
-- tenant_id is NULL for a system template, and PostgreSQL treats NULLs as distinct — ON CONFLICT
-- would not deduplicate on a re-run.
--
-- Rollback: rollbacks/20260831000001_safety_compliance_failed_notification_template.rollback.sql

INSERT INTO notifications.notification_templates
  (tenant_id, event_type, channel, subject_template, body_template, is_active)
SELECT v.tenant_id, v.event_type, v.channel::notifications."NotificationChannel",
       v.subject_template, v.body_template, true
FROM (VALUES
  (NULL::uuid, 'safety.compliance.failed.v1', 'IN_APP',
   'Safety requirement not met',
   '{{detail}}'),
  (NULL::uuid, 'safety.compliance.failed.v1', 'EMAIL',
   'Safety requirement not met — {{failure_type}}',
   '{{detail}}

This alert cannot be switched off: §19.6 classifies critical safety notifications as un-suppressible.')
) AS v(tenant_id, event_type, channel, subject_template, body_template)
WHERE NOT EXISTS (
  SELECT 1 FROM notifications.notification_templates t
  WHERE t.tenant_id IS NULL
    AND t.event_type = v.event_type
    AND t.channel = v.channel::notifications."NotificationChannel"
);
