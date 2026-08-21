-- Rollback: 20260723000003_notification_delivery_rules
-- Reverses: migrations/20260723000003_notification_delivery_rules/migration.sql
--
-- Three of the four changes reverse trivially. The fourth does not: the migration runs
-- `ALTER TYPE notifications."NotificationChannel" ADD VALUE 'PUSH'`, and **PostgreSQL cannot remove
-- an enum value** — there is no ALTER TYPE ... DROP VALUE. Reversing it means recreating the type
-- and re-pointing every column that uses it, which is why this script is longer than its siblings.
--
-- Columns typed NotificationChannel (verified against a live database, 2026-08-22):
--   notifications.notification_templates.channel
--   notifications.notifications.channel
--   notifications.notification_preferences.channel
-- All three are NOT NULL with no DEFAULT, so no default needs dropping and restoring around the swap.
--
-- IDEMPOTENT (§9.7.1): every step is guarded. The PUSH pre-check compares `channel::text` rather than
-- the enum literal 'PUSH', so re-running after the value is already gone does not fail on an invalid
-- enum cast.
--
-- WARNING — read before running: this script REFUSES to run if any row still uses PUSH, rather than
-- destroying those rows. §9.7.1 prohibits dropping data that cannot be recovered. Re-channel or
-- delete those rows deliberately first; do not "fix" this by removing the guard.

-- 1. Refuse rather than lose data.
DO $$
DECLARE offending bigint;
BEGIN
  SELECT (SELECT count(*) FROM notifications.notification_preferences WHERE channel::text = 'PUSH')
       + (SELECT count(*) FROM notifications.notification_templates   WHERE channel::text = 'PUSH')
       + (SELECT count(*) FROM notifications.notifications            WHERE channel::text = 'PUSH')
    INTO offending;

  IF offending > 0 THEN
    RAISE EXCEPTION
      'Rollback aborted: % row(s) still use NotificationChannel.PUSH. Re-channel or delete them first (9.7.1: a rollback must not destroy unrecoverable data).',
      offending;
  END IF;
END $$;

-- 2. Escalation index and marker (§19.3).
DROP INDEX IF EXISTS notifications.idx_notif_escalation;

ALTER TABLE notifications.notifications
  DROP COLUMN IF EXISTS escalated_at;

-- 3. Quiet-hours window (§19.6).
ALTER TABLE notifications.notification_preferences
  DROP COLUMN IF EXISTS quiet_hours_start,
  DROP COLUMN IF EXISTS quiet_hours_end;

-- 4. Remove PUSH by recreating the type. Guarded so a second run is a no-op.
--    The four remaining labels are restored in their original sort order — PUSH was appended last.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'notifications'
      AND t.typname = 'NotificationChannel'
      AND e.enumlabel = 'PUSH'
  ) THEN
    ALTER TYPE notifications."NotificationChannel" RENAME TO "NotificationChannel_rollback_old";

    CREATE TYPE notifications."NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'LINE', 'SMS');

    ALTER TABLE notifications.notification_templates
      ALTER COLUMN channel TYPE notifications."NotificationChannel"
      USING channel::text::notifications."NotificationChannel";

    ALTER TABLE notifications.notifications
      ALTER COLUMN channel TYPE notifications."NotificationChannel"
      USING channel::text::notifications."NotificationChannel";

    ALTER TABLE notifications.notification_preferences
      ALTER COLUMN channel TYPE notifications."NotificationChannel"
      USING channel::text::notifications."NotificationChannel";

    DROP TYPE notifications."NotificationChannel_rollback_old";
  END IF;
END $$;
