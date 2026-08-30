-- safety.violation.detected.v1 notification template (Phase 23).
--
-- The fifth of the five halves the Phase 23 Generate entry requires for this event: a routed event
-- with no template row is dropped by NotificationService.notifyUser at `if (!template) continue`, so
-- without this the §19.6 "cannot be disabled" guarantee would apply to a notification that is never
-- created. That is exactly the state safety.incident.created.v1 was found in.
--
-- IN_APP only, matching the safety-incident template: dispatch delivers IN_APP over SSE and Expo
-- push, which covers both the "In-app" and "Push" cells §19.4 assigns to Executive / PM / Site
-- Engineer / Safety Officer for the safety row.
--
-- Placeholders are the flat payload of safety.violation.detected.v1.avsc. `violations` is an array;
-- Handlebars renders it comma-joined, which is what a notification line wants.
-- Rollback: prisma/rollbacks/20260825000003_safety_violation_notification_template.rollback.sql

INSERT INTO notifications.notification_templates
  (tenant_id, event_type, channel, subject_template, body_template, is_active)
VALUES
  (
    NULL,
    'safety.violation.detected.v1',
    'IN_APP',
    'Safety violation detected ({{severity}})',
    'A {{severity}} safety violation was detected on project {{project_id}}: {{violations}}. Confidence {{confidence}} (photo {{file_id}}, violation {{violation_id}}).',
    true
  )
ON CONFLICT (tenant_id, event_type, channel) DO NOTHING;
