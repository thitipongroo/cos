-- Rollback: 20260623000001_app_user_login_and_grants
-- Reverses ONLY what that migration added:
--   * LOGIN capability on app_user (role returns to NOLOGIN; the dev password becomes inert —
--     PostgreSQL has no "remove password", NOLOGIN neutralizes it)
--   * grants + default privileges on the 6 schemas the phase16 grant list was missing
--     (crm, digital_twin, equipment, equipment_telemetry, workforce, workforce_telemetry)
-- The 9 phase16-era schemas (ai, boq, files, finance, notifications, platform, procurement,
-- projects, site_ops) are intentionally NOT revoked here — they belong to
-- 20260608000004_rls_policies and its own rollback.
-- WARNING: after this rollback the application can no longer connect via APP_DATABASE_URL
-- (RLS-enforced path) — roll back the application configuration first (QM-9).

ALTER ROLE app_user WITH NOLOGIN;

DO $$ DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY[
    'crm','digital_twin','equipment','equipment_telemetry','workforce','workforce_telemetry'
  ]
  LOOP
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM app_user', s);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE USAGE, SELECT ON SEQUENCES FROM app_user', s);
    EXECUTE format('REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I FROM app_user', s);
    EXECUTE format('REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I FROM app_user', s);
    EXECUTE format('REVOKE USAGE ON SCHEMA %I FROM app_user', s);
  END LOOP;
END $$;
