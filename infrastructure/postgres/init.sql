-- Construction OS — PostgreSQL initialization
-- Creates the platform schema for cross-tenant system tables (identity module)
-- All tenant-specific schemas are provisioned at runtime by TenantService

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- TimescaleDB is already enabled via the timescale/timescaledb Docker image

-- Platform schema: cross-tenant system tables (identity, tenants, audit)
CREATE SCHEMA IF NOT EXISTS platform;

-- Keycloak schema: Keycloak (KC_DB_SCHEMA=keycloak) stores its tables here. Keycloak
-- creates its own tables but NOT the schema itself, so it must exist before startup.
CREATE SCHEMA IF NOT EXISTS keycloak;

-- Application role: the least-privilege, RLS-enforcing role is `app_user`. It is created
-- (NOLOGIN) and granted by the Prisma RLS migration 20260608000004_rls_policies, then given
-- LOGIN + password + CRUD grants across all domain schemas (incl. platform) by
-- 20260623000001_app_user_login_and_grants. Migrations are the single source of truth for
-- app_user — do not also create/grant it here (ADR-031).
