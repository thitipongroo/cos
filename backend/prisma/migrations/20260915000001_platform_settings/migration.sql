-- platform.platform_settings — the platform-wide settings SYSTEM_ADMIN edits on System Settings (ADR-108).
--
-- WHY THIS TABLE EXISTS
-- ---------------------
-- §6.7 grants SYSTEM_ADMIN "Platform configuration — update platform-wide settings: feature flags, rate
-- limits, SLA parameters", and the Stitch "System Settings - SYSTEM_ADMIN" screen draws a form for it.
-- Nothing stored a value that form could read or save (product-owner decision D10, 2026-09-15).
--
-- STORED ONLY. NOTHING READS THESE VALUES YET. No gateway client, scheduler, throttler, pool or quota check
-- in this repository consults this table — ADR-108 lists every drawn setting and states that none is
-- enforced. Changing a row changes what the screen shows and what the audit trail records, and nothing
-- else. A future consumer is a decision of its own, not a side effect of this migration.
--
-- ONE DOCUMENT, ONE ROW
-- ---------------------
-- The settings are a single typed document validated whole by the API (PlatformSettings in
-- backend/src/modules/platform-settings). One row keyed 'global' carries it, so one version number covers
-- the whole form: two operators saving different sections of the same stale page conflict (409) instead
-- of one silently overwriting the other's section. The CHECK on settings_key keeps it one row — a second
-- key would be a second document nobody validates or reads.
--
-- NOT RLS-SCOPED. platform.* cross-tenant tables with no tenant_id are RLS-exempt (§11.0), as
-- platform.scheduled_job_locks (20260819000002) is: the row describes the deployment, not a tenant's data,
-- and there is no tenant to scope it to. The audit row each change writes IS tenant-scoped and passes
-- audit_logs' RLS through SET LOCAL app.current_tenant_id — see PlatformSettingsService.
--
-- BACKWARD-COMPATIBLE (QM-9): a new table. No existing table, column, policy or row is touched, so the
-- running backend is unaffected before, during and after it.

CREATE TABLE platform.platform_settings (
  -- Always 'global'. A key rather than a bare singleton so the primary key is what arbitrates two
  -- concurrent first saves (INSERT … ON CONFLICT), exactly as scheduled_job_locks.job_name does.
  settings_key TEXT        PRIMARY KEY
                             CONSTRAINT platform_settings_single_document CHECK (settings_key = 'global'),
  -- The whole PlatformSettings document. Validated by the API before it is written; the CHECK only
  -- refuses a value that is not an object at all.
  value        JSONB       NOT NULL
                             CONSTRAINT platform_settings_value_is_object CHECK (jsonb_typeof(value) = 'object'),
  -- Optimistic concurrency. A save names the version it read; a stored version that has moved since is a
  -- 409. The API reports 0 while no row exists, so the first stored version is 1.
  version      INTEGER     NOT NULL
                             CONSTRAINT platform_settings_version_positive CHECK (version >= 1),
  -- NULL only if the row was ever written outside the API. Same foreign-key behaviour as
  -- audit_logs.actor_id: a user with a settings change on record is not deleted from under it.
  updated_by   UUID        NULL
                             CONSTRAINT platform_settings_updated_by_fkey
                             REFERENCES platform.users (user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The table is read and written by the privileged DATABASE_URL connection the platform/cross-tenant
-- services already use (see 20260623000001_app_user_login_and_grants). app_user is granted anyway so the
-- schema stays uniform with every other platform.* table, as 20260819000002 did.
GRANT SELECT, INSERT, UPDATE, DELETE ON platform.platform_settings TO app_user;
