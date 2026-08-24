-- Rollback for 20260825000001_provisioning_human_gate_templates.
-- Removes the two system-default templates for the §19.8 provisioning human gate. With them gone the
-- workflow's approval notification is dropped at `if (!template) continue` — the gate goes silent.
DELETE FROM notifications.notification_templates
WHERE tenant_id IS NULL
  AND event_type = 'platform.enterprise.awaiting_approval';
