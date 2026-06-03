// RBAC Role Definitions
// Source: context/00_master_construction_os.md §Phase 2 (C-03 resolved 2026-05-27; ADR-014)
// Authoritative spec: docs/specifications/06-rbac-permission-matrix.md §6.2 and §6.8

export enum CosRole {
  // ── Spec §6.2 roles — seeded at tenant provisioning ──────────────────
  // Cross-tenant platform admin (NOT provisioned to any tenant — §6.7)
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
  // Tenant-scoped roles
  TENANT_ADMIN = 'TENANT_ADMIN',
  EXECUTIVE = 'EXECUTIVE',
  PROJECT_MANAGER = 'PROJECT_MANAGER',
  PROCUREMENT_OFFICER = 'PROCUREMENT_OFFICER',
  FINANCE = 'FINANCE',
  SAFETY_OFFICER = 'SAFETY_OFFICER',
  SITE_ENGINEER = 'SITE_ENGINEER',
  CRM_SALES_MANAGER = 'CRM_SALES_MANAGER',
  // ── Spec §6.8 implementation sub-roles — assigned manually post-provisioning ──
  PROC_MANAGER = 'PROC_MANAGER',
  SITE_WORKER = 'SITE_WORKER',
  VIEWER = 'VIEWER',
}
