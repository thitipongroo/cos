-- Multi-role support (NIST RBAC / Keycloak pattern): a user may hold ADDITIONAL roles beyond the
-- primary role in platform.tenant_memberships. Effective roles = primary ∪ additional; effective
-- permissions = union of ROLE_PERMISSIONS across all. Platform table (RLS-exempt).
CREATE TABLE IF NOT EXISTS platform.user_additional_roles (
  user_id     UUID NOT NULL,
  tenant_id   UUID NOT NULL,
  role        platform."CosRoleEnum" NOT NULL,
  assigned_by UUID,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id, role)
);
CREATE INDEX IF NOT EXISTS idx_user_additional_roles_user
  ON platform.user_additional_roles (user_id, tenant_id);
