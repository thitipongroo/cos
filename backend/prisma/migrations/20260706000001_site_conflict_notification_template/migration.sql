-- Phase 6 — site.conflict.flagged.v1 notification (ConflictRecord "persistence AND notification").
-- Seeds a system-wide default IN_APP template (tenant_id IS NULL) so a flagged offline-sync
-- conflict actually surfaces to SITE_ENGINEER / PROJECT_MANAGER / TENANT_ADMIN for manual review.
-- tenant_id IS NULL = system default; per-tenant rows override (see 20260605000003 comment).

INSERT INTO notifications.notification_templates
  (tenant_id, event_type, channel, subject_template, body_template, is_active)
VALUES
  (
    NULL,
    'site.conflict.flagged.v1',
    'IN_APP',
    'Sync conflict needs review',
    'A {{conflict_type}} conflict on {{entity_type}} {{entity_id}} was flagged during offline sync and needs manual review (conflict {{conflict_id}}).',
    true
  )
ON CONFLICT (tenant_id, event_type, channel) DO NOTHING;
