-- Phase 20 — safety.incident.created.v1 notification template.
--
-- §19.6: "critical safety notifications cannot be disabled or quieted — always delivered".
-- NotificationService.notifyUser skips any channel with no template row (`if (!template) continue`),
-- so without this seed the one event the spec calls critical produced ZERO notifications on every
-- channel — the preference bypass and the §19.3 30-minute escalation to PM both had nothing to act on.
--
-- IN_APP only: dispatch() delivers an IN_APP notification over SSE *and* Expo push, which covers both
-- the "In-app" and "Push" cells §19.4 assigns to Executive / PM / Site Engineer / Safety Officer for
-- SafetyIncidentReported. §19.4 assigns no email or LINE cell to this event.
--
-- tenant_id IS NULL = system default; per-tenant rows override (see 20260605000003 comment).
-- Placeholders are the flat payload of safety.incident.created.v1.avsc.

INSERT INTO notifications.notification_templates
  (tenant_id, event_type, channel, subject_template, body_template, is_active)
VALUES
  (
    NULL,
    'safety.incident.created.v1',
    'IN_APP',
    'Safety incident reported ({{severity}})',
    'A {{severity}} {{incident_type}} safety incident was reported on project {{project_id}} and needs acknowledgement (incident {{incident_id}}).',
    true
  )
ON CONFLICT (tenant_id, event_type, channel) DO NOTHING;
