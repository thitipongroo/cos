-- Phase 20: Notification Service
-- Global schema (not per-tenant): all tables have tenant_id column for row-level filtering.
-- Backward-compatible: new schema, no modifications to existing schemas.

CREATE SCHEMA IF NOT EXISTS notifications;

-- ─── ENUMs ───────────────────────────────────────────────────────────────────

CREATE TYPE notifications."NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'LINE', 'SMS');
CREATE TYPE notifications."NotificationStatus"  AS ENUM ('PENDING', 'SENT', 'FAILED', 'READ');

-- ─── notification_templates ───────────────────────────────────────────────────
-- null tenant_id = system-wide default template; tenant-specific templates override.

CREATE TABLE notifications.notification_templates (
  template_id      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID,
  event_type       VARCHAR(255) NOT NULL,
  channel          notifications."NotificationChannel" NOT NULL,
  subject_template TEXT,
  body_template    TEXT         NOT NULL,
  is_active        BOOLEAN      NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, event_type, channel)
);

CREATE INDEX idx_notif_tmpl_event ON notifications.notification_templates (event_type, channel, is_active);

-- ─── notifications ────────────────────────────────────────────────────────────

CREATE TABLE notifications.notifications (
  notification_id  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID         NOT NULL,
  recipient_id     UUID         NOT NULL,
  channel          notifications."NotificationChannel" NOT NULL,
  event_type       VARCHAR(255) NOT NULL,
  subject          TEXT,
  body             TEXT         NOT NULL,
  status           notifications."NotificationStatus" NOT NULL DEFAULT 'PENDING',
  sent_at          TIMESTAMPTZ,
  read_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_notif_recipient ON notifications.notifications (tenant_id, recipient_id, status);
CREATE INDEX idx_notif_created   ON notifications.notifications (tenant_id, created_at DESC);

-- ─── notification_preferences ─────────────────────────────────────────────────

CREATE TABLE notifications.notification_preferences (
  pref_id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID         NOT NULL,
  user_id          UUID         NOT NULL,
  event_type       VARCHAR(255) NOT NULL,
  channel          notifications."NotificationChannel" NOT NULL,
  is_enabled       BOOLEAN      NOT NULL DEFAULT true,
  UNIQUE (user_id, event_type, channel)
);

CREATE INDEX idx_notif_pref_user ON notifications.notification_preferences (tenant_id, user_id);

-- ─── notification_device_tokens ───────────────────────────────────────────────
-- Required for Expo Push delivery: each user device registers its push token here.

CREATE TYPE notifications."DevicePlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');

CREATE TABLE notifications.notification_device_tokens (
  token_id    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL,
  user_id     UUID         NOT NULL,
  push_token  VARCHAR(512) NOT NULL,
  platform    notifications."DevicePlatform" NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (user_id, push_token)
);

CREATE INDEX idx_notif_tokens_user ON notifications.notification_device_tokens (tenant_id, user_id);
