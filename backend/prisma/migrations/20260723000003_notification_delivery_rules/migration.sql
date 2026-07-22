-- Phase 20 notification delivery rules (§19.3 / §19.6): quiet hours, PUSH channel, escalation tracking.
--
-- 1. quiet_hours on notification_preferences (§19.6): per-user window (default 22:00–07:00, tenant tz)
--    during which NON-critical push is suppressed. Critical safety notifications are never quieted
--    (enforced in code, not schema). TIME columns store the local wall-clock window; the tenant's
--    IANA timezone (platform.tenants.timezone) resolves "now" for the comparison.
-- 2. PUSH enum value (§19.2): spec models push as a first-class channel. Expo push was previously
--    delivered piggybacked on IN_APP; PUSH makes template/preference/notification rows explicit.
-- 3. escalated_at on notifications (§19.3 escalation): idempotency marker so the escalation poller
--    escalates an unacknowledged immediate notification exactly once (NULL = not yet escalated).

ALTER TABLE notifications.notification_preferences
  ADD COLUMN IF NOT EXISTS quiet_hours_start TIME NOT NULL DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS quiet_hours_end   TIME NOT NULL DEFAULT '07:00';

-- ALTER TYPE ... ADD VALUE is not usable in the same transaction it is created in, but this migration
-- never references 'PUSH' below, so adding it here is safe (PostgreSQL 12+).
ALTER TYPE notifications."NotificationChannel" ADD VALUE IF NOT EXISTS 'PUSH';

ALTER TABLE notifications.notifications
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

-- Escalation poller scans unacknowledged immediate notifications; index the exact predicate.
CREATE INDEX IF NOT EXISTS idx_notif_escalation
  ON notifications.notifications (event_type, status, read_at, escalated_at, created_at);
