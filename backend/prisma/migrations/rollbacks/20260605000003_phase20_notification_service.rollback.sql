-- Rollback: Phase 20 Notification Service
-- Reverses: 20260605000003_phase20_notification_service/migration.sql
-- Run AFTER rolling back all migrations that depend on the notifications schema.

-- Drop tables in reverse dependency order

DROP TABLE IF EXISTS notifications.notification_device_tokens;
DROP TABLE IF EXISTS notifications.notification_preferences;
DROP TABLE IF EXISTS notifications.notifications;
DROP TABLE IF EXISTS notifications.notification_templates;

-- Drop ENUMs

DROP TYPE IF EXISTS notifications."DevicePlatform";
DROP TYPE IF EXISTS notifications."NotificationStatus";
DROP TYPE IF EXISTS notifications."NotificationChannel";

-- Drop schema (safe only after all tables are dropped)

DROP SCHEMA IF EXISTS notifications;
