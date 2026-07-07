-- G-M12 — site.issue.escalated.v1 notification (escalate an issue → notify the Project Manager).
-- Seeds a system-wide default IN_APP template (tenant_id IS NULL) so an escalated issue surfaces to
-- the PROJECT_MANAGER for attention. tenant_id IS NULL = system default; per-tenant rows override.
INSERT INTO notifications.notification_templates
  (tenant_id, event_type, channel, subject_template, body_template, is_active)
VALUES
  (
    NULL,
    'site.issue.escalated.v1',
    'IN_APP',
    'Issue escalated',
    'Issue "{{title}}" ({{severity}}) on project {{project_id}} was escalated for your attention (issue {{issue_id}}).',
    true
  );
