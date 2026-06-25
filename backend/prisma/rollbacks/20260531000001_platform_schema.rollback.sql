-- Rollback: Phase 2 platform schema
-- Removes all Phase 2 platform tables and types.
-- WARNING: drops all tenant, user, membership, and audit data.

DROP TABLE IF EXISTS platform.otp_audit CASCADE;
DROP TABLE IF EXISTS platform.audit_logs CASCADE;
DROP TABLE IF EXISTS platform.tenant_memberships CASCADE;
DROP TABLE IF EXISTS platform.users CASCADE;
DROP TABLE IF EXISTS platform.tenants CASCADE;
DROP TYPE IF EXISTS platform."CosRoleEnum" CASCADE;
DROP TYPE IF EXISTS platform."PlanType" CASCADE;
DROP SCHEMA IF EXISTS platform CASCADE;
