-- Phase 2: Platform schema — Auth + Tenant System
-- Creates the "platform" schema with cross-tenant system tables.
-- All tenant-scoped entities live in separate schemas ({tenant_code}).
-- Backward-compatible: adds new schema/tables, no modifications to existing.

-- Create platform schema
CREATE SCHEMA IF NOT EXISTS platform;

-- Set search path for this migration
SET search_path = platform;

-- ─── Enums ────────────────────────────────────────────────────────────────

CREATE TYPE platform."PlanType" AS ENUM (
  'STARTER',
  'PROFESSIONAL',
  'ENTERPRISE'
);

CREATE TYPE platform."CosRoleEnum" AS ENUM (
  'SYSTEM_ADMIN',
  'TENANT_ADMIN',
  'EXECUTIVE',
  'PROJECT_MANAGER',
  'PROCUREMENT_OFFICER',
  'FINANCE',
  'SAFETY_OFFICER',
  'SITE_ENGINEER',
  'CRM_SALES_MANAGER',
  'PROC_MANAGER',
  'SITE_WORKER',
  'VIEWER'
);

-- ─── tenants ──────────────────────────────────────────────────────────────

CREATE TABLE platform.tenants (
  tenant_id       UUID        NOT NULL DEFAULT gen_random_uuid(),
  tenant_code     VARCHAR(50) NOT NULL,
  tenant_name     VARCHAR(255) NOT NULL,
  keycloak_realm  VARCHAR(100) NOT NULL,
  plan_type       platform."PlanType" NOT NULL,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tenants_pkey PRIMARY KEY (tenant_id),
  CONSTRAINT tenants_tenant_code_key UNIQUE (tenant_code),
  CONSTRAINT tenants_keycloak_realm_key UNIQUE (keycloak_realm)
);

-- ─── users ────────────────────────────────────────────────────────────────

CREATE TABLE platform.users (
  user_id           UUID         NOT NULL DEFAULT gen_random_uuid(),
  tenant_id         UUID         NOT NULL,
  keycloak_user_id  VARCHAR(255) NOT NULL,
  email             VARCHAR(255) NOT NULL,
  display_name      VARCHAR(255) NOT NULL,
  is_active         BOOLEAN      NOT NULL DEFAULT true,
  mfa_enabled       BOOLEAN      NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT users_pkey PRIMARY KEY (user_id),
  CONSTRAINT users_keycloak_user_id_key UNIQUE (keycloak_user_id),
  CONSTRAINT users_tenant_fkey FOREIGN KEY (tenant_id)
    REFERENCES platform.tenants (tenant_id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX users_tenant_email_idx ON platform.users (tenant_id, email);

-- ─── tenant_memberships ───────────────────────────────────────────────────

CREATE TABLE platform.tenant_memberships (
  membership_id UUID                    NOT NULL DEFAULT gen_random_uuid(),
  tenant_id     UUID                    NOT NULL,
  user_id       UUID                    NOT NULL,
  role          platform."CosRoleEnum"  NOT NULL,
  assigned_at   TIMESTAMPTZ             NOT NULL DEFAULT now(),

  CONSTRAINT tenant_memberships_pkey PRIMARY KEY (membership_id),
  CONSTRAINT tenant_memberships_tenant_user_key UNIQUE (tenant_id, user_id),
  CONSTRAINT tenant_memberships_tenant_fkey FOREIGN KEY (tenant_id)
    REFERENCES platform.tenants (tenant_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT tenant_memberships_user_fkey FOREIGN KEY (user_id)
    REFERENCES platform.users (user_id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ─── audit_logs ───────────────────────────────────────────────────────────
-- Immutable: application role may INSERT only (RLS enforced in Phase 16)

CREATE TABLE platform.audit_logs (
  log_id        UUID         NOT NULL DEFAULT gen_random_uuid(),
  tenant_id     UUID         NOT NULL,
  actor_id      UUID         NOT NULL,
  action        VARCHAR(255) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id   UUID,
  ip_address    INET,
  user_agent    TEXT,
  occurred_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  metadata      JSONB,

  CONSTRAINT audit_logs_pkey PRIMARY KEY (log_id),
  CONSTRAINT audit_logs_tenant_fkey FOREIGN KEY (tenant_id)
    REFERENCES platform.tenants (tenant_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT audit_logs_actor_fkey FOREIGN KEY (actor_id)
    REFERENCES platform.users (user_id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX audit_logs_tenant_occurred_idx
  ON platform.audit_logs (tenant_id, occurred_at DESC);

-- ─── OTP store (Redis-backed in application; table for audit trail only) ──
-- Stores OTP metadata for audit — actual OTP values live in Redis (TTL 5min)

CREATE TABLE platform.otp_audit (
  otp_id       UUID        NOT NULL DEFAULT gen_random_uuid(),
  -- @pdpa(category: "contact") — phone number is personal data
  phone_number VARCHAR(20) NOT NULL,
  tenant_id    UUID,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at  TIMESTAMPTZ,
  ip_address   INET,

  CONSTRAINT otp_audit_pkey PRIMARY KEY (otp_id)
);

CREATE INDEX otp_audit_phone_requested_idx
  ON platform.otp_audit (phone_number, requested_at DESC);
