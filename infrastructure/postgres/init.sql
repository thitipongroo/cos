-- Construction OS — PostgreSQL initialization
-- Creates the platform schema for cross-tenant system tables (identity module)
-- All tenant-specific schemas are provisioned at runtime by TenantService

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- TimescaleDB is already enabled via the timescale/timescaledb Docker image

-- Platform schema: cross-tenant system tables (identity, tenants, audit)
CREATE SCHEMA IF NOT EXISTS platform;

-- Application role with limited privileges (used by the application)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cos_app') THEN
    CREATE ROLE cos_app WITH LOGIN PASSWORD 'cos_app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA platform TO cos_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA platform TO cos_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA platform TO cos_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA platform GRANT ALL ON TABLES TO cos_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA platform GRANT ALL ON SEQUENCES TO cos_app;
