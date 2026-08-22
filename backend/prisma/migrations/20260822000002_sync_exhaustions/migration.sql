-- platform.sync_exhaustions — the tenant-admin review queue §17.2 has always specified.
--
-- WHAT WAS MISSING
-- ----------------
-- §17.2 tabulates what happens when a queued offline mutation exhausts its 5 retries. Four entity
-- types are supposed to land in a server-side queue an admin can review and manually import:
--
--   Safety incidents      → review queue; push alert to PM AND Safety Officer; kept on device
--   Workforce attendance  → review queue; push alert to PM;                    kept on device
--   Inspection results    → review queue; push alert to PM;                    kept on device
--   Material consumption  → review queue; no push alert;                       kept on device
--
-- `SyncManager.handleExhaustion` routes those four to `this.callbacks.onExhausted` correctly. But
-- `runPushSync.ts` — the only production construction of SyncManager — supplied `onRejected` and
-- `onUserNotify` and NOT `onExhausted`. On the server there was no queue table, no endpoint and no
-- `platform.sync.exhausted` producer or consumer. So a safety incident that failed to sync five
-- times escalated to nobody: the record survived on the device, and the person who filed it had no
-- way to learn it never arrived (TDD OQ-38).
--
-- WHY THE PAYLOAD IS STORED
-- -------------------------
-- §17.2: records "can be reviewed and manually imported" by the admin, and are "never deleted from
-- the device until successfully synced or explicitly resolved by an admin". Reviewing a record the
-- queue does not hold would mean asking the reporter to read it off their phone, so the queue keeps
-- the mutation itself. That makes this table a PII surface — a failed safety incident carries its
-- description and the reporter — which is why it is RLS-scoped like every other tenant table and why
-- resolution is recorded rather than the row being deleted.
--
-- Product-owner decision 2026-08-22.
--
-- Rollback: rollbacks/20260822000002_sync_exhaustions.rollback.sql

CREATE TABLE IF NOT EXISTS platform.sync_exhaustions (
  exhaustion_id       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID          NOT NULL,

  -- The mutation, as the device queued it.
  entity_type         VARCHAR(100)  NOT NULL,
  entity_id           UUID          NOT NULL,
  operation           VARCHAR(10)   NOT NULL,
  payload             JSONB         NOT NULL,

  -- Who and when. `reported_by` is the signed-in user whose device gave up, taken from the JWT
  -- rather than the request body so it cannot be spoofed by a replayed queue item.
  reported_by         UUID          NOT NULL,
  client_submitted_at TIMESTAMPTZ,
  last_error          TEXT,
  retry_count         INTEGER       NOT NULL DEFAULT 5,

  -- PENDING until an admin acts. Resolution is a state change, never a delete: §17.2 makes the
  -- device's copy conditional on it, so losing the row would strand the record on the phone forever.
  status              VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
  resolution          VARCHAR(20),
  resolved_by         UUID,
  resolved_at         TIMESTAMPTZ,
  resolution_note     TEXT,

  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT sync_exhaustions_status_check
    CHECK (status IN ('PENDING', 'RESOLVED')),
  CONSTRAINT sync_exhaustions_resolution_check
    CHECK (resolution IS NULL OR resolution IN ('IMPORTED', 'DISCARDED')),
  -- A resolved row must say who resolved it and how; a pending row must claim neither.
  CONSTRAINT sync_exhaustions_resolution_consistency
    CHECK (
      (status = 'PENDING'  AND resolution IS NULL     AND resolved_by IS NULL     AND resolved_at IS NULL)
      OR
      (status = 'RESOLVED' AND resolution IS NOT NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
    ),

  -- One row per failed mutation. A device that retries reporting the same exhaustion — a plausible
  -- outcome of an app restart mid-report — must not create a second queue entry for one record.
  CONSTRAINT sync_exhaustions_unique_entity UNIQUE (tenant_id, entity_type, entity_id)
);

-- The admin queue's only query: this tenant's pending rows, newest first.
CREATE INDEX IF NOT EXISTS idx_sync_exhaustions_pending
  ON platform.sync_exhaustions (tenant_id, status, created_at DESC);

-- ─── RLS (§7.7) ──────────────────────────────────────────────────────────────
-- ENABLE and FORCE together, so the table owner cannot bypass it either.

ALTER TABLE platform.sync_exhaustions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.sync_exhaustions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant_isolation ON platform.sync_exhaustions;
CREATE POLICY rls_tenant_isolation ON platform.sync_exhaustions
  AS PERMISSIVE
  FOR ALL
  TO app_user
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid);

-- ─── Notification templates for platform.sync.exhausted.v1 ───────────────────
-- tenant_id NULL = system template, the same shape 20260706000001 uses for the conflict template.
-- Handlebars, rendered by NotificationService.render.
--
-- IN_APP and EMAIL only. There is no PUSH row because there is no PUSH delivery path:
-- NotificationService.CHANNELS is ['IN_APP','EMAIL','LINE'], and the Expo push §17.2 asks for is
-- sent from inside the IN_APP branch of dispatch() alongside the SSE event. A PUSH-channel template
-- would be a row nothing ever reads.
--
-- Guarded with NOT EXISTS rather than ON CONFLICT: the unique constraint is
-- (tenant_id, event_type, channel) and tenant_id is NULL here, and PostgreSQL treats NULLs as
-- distinct — so ON CONFLICT would not deduplicate a system template and a re-run would insert a
-- second copy. (20260706000001 has the same property.)

INSERT INTO notifications.notification_templates
  (tenant_id, event_type, channel, subject_template, body_template, is_active)
SELECT v.tenant_id, v.event_type, v.channel::notifications."NotificationChannel",
       v.subject_template, v.body_template, true
FROM (VALUES
  (NULL::uuid, 'platform.sync.exhausted.v1', 'IN_APP',
   'Offline record could not be synced',
   'A {{entity_type}} recorded offline failed to sync after {{retry_count}} attempts and is waiting in the admin review queue. It is still on the reporter''s device.'),
  (NULL::uuid, 'platform.sync.exhausted.v1', 'EMAIL',
   'Offline record could not be synced',
   'A {{entity_type}} recorded offline failed to sync after {{retry_count}} attempts. It is in the tenant admin review queue and remains on the reporter''s device until imported or discarded.')
) AS v(tenant_id, event_type, channel, subject_template, body_template)
WHERE NOT EXISTS (
  SELECT 1 FROM notifications.notification_templates t
  WHERE t.tenant_id IS NULL
    AND t.event_type = v.event_type
    AND t.channel = v.channel::notifications."NotificationChannel"
);
