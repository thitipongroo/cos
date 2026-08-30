-- §19.8 provisioning human gate — In-app + Email templates.
--
-- The gate is the one notification in §19.8 that is NOT a Kafka event: "sent directly by
-- EnterpriseProvisioningWorkflow via the Notification Service". It therefore has no canonical event
-- type and no .avsc, but it still needs template rows, because the Notification Service decides both
-- the wording AND the channel set from this table.
--
-- Two rows, matching the §19.8 routing table for the gate (In-app Yes, Email Yes, Push "—"). Before
-- this, the workflow wrote a single IN_APP row with raw SQL, so the email half of the spec had no
-- implementation at all and the wording lived in a string literal beside the INSERT.
--
-- Subject and body are taken verbatim from the §19.8 "Notification content" table.
-- Rollback: prisma/rollbacks/20260825000001_provisioning_human_gate_templates.rollback.sql

INSERT INTO notifications.notification_templates
  (tenant_id, event_type, channel, subject_template, body_template, is_active)
VALUES
  (
    NULL,
    'platform.enterprise.awaiting_approval',
    'IN_APP',
    'Data migration approval required',
    'Dedicated DB provisioned for {{tenant_name}}. Approve or abort data migration.',
    true
  ),
  (
    NULL,
    'platform.enterprise.awaiting_approval',
    'EMAIL',
    'Data migration approval required',
    'Dedicated DB provisioned for {{tenant_name}}. Approve or abort data migration.',
    true
  )
ON CONFLICT (tenant_id, event_type, channel) DO NOTHING;
