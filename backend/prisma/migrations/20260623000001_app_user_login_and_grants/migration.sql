-- app_user — application DB role for tenant-scoped queries.
--
-- The application connects as this NON-SUPERUSER, NON-OWNER role for all tenant-scoped
-- queries (APP_DATABASE_URL → TenantPrismaService) so PostgreSQL Row-Level Security is
-- actually ENFORCED. Connecting as the owner/superuser (`cos`) bypasses RLS entirely
-- (owner/superuser are exempt, even under FORCE ROW LEVEL SECURITY) — so RLS provided no
-- isolation until this role was wired in. Platform/cross-tenant services keep the
-- privileged `cos` connection (DATABASE_URL).
--
-- app_user is created (without LOGIN) and granted on 9 schemas by the phase16 RLS
-- migration; this migration adds LOGIN + a password and extends grants to ALL domain
-- schemas (the phase16 list was incomplete: crm, digital_twin, equipment,
-- equipment_telemetry, workforce, workforce_telemetry were missing).
--
-- Local-dev password only — production injects credentials via Vault / AWS Secrets Manager
-- (spec §5.2, QM-4); never use this value outside local dev.

ALTER ROLE app_user WITH LOGIN PASSWORD 'app_user_dev_password';

DO $$ DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY[
    'ai','boq','crm','digital_twin','equipment','equipment_telemetry','files','finance',
    'notifications','platform','procurement','projects','site_ops','workforce','workforce_telemetry'
  ]
  LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO app_user', s);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO app_user', s);
    EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO app_user', s);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user', s);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO app_user', s);
  END LOOP;
END $$;
