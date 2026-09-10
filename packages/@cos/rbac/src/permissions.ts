import { CosRole } from '@cos/types';

// Permission format: resource:action
// Example: 'project:read', 'boq:write', 'finance:approve'
// Source: docs/specifications/06-rbac-permission-matrix.md §6.4 (spec roles) and §6.8 (sub-roles)

export type Permission = string;

export const ROLE_PERMISSIONS: Record<CosRole, Permission[]> = {
  // ── Spec §6.2 roles ──────────────────────────────────────────────────────
  [CosRole.SYSTEM_ADMIN]: ['*:*'], // cross-tenant — never granted to tenant users
  [CosRole.TENANT_ADMIN]: ['*:*'], // full access within tenant
  [CosRole.EXECUTIVE]: [
    'project:read',
    'boq:read',
    'procurement:read',
    'finance:read',
    'site-ops:read',
    'analytics:read',
    'ai:read',
    'finance:approve',
  ],
  [CosRole.PROJECT_MANAGER]: [
    'project:read',
    'project:write',
    'project:manage-members',
    'boq:read',
    'boq:write',
    'procurement:read',
    'procurement:write',
    'procurement:approve',
    'site-ops:read',
    'site-ops:write',
    'finance:read',
    'analytics:read',
    'ai:read',
  ],
  [CosRole.PROCUREMENT_OFFICER]: [
    'procurement:read',
    'procurement:write',
    'vendor:read',
    'vendor:write',
    'boq:read',
    'project:read',
  ],
  [CosRole.FINANCE]: [
    'finance:read',
    'finance:write',
    'finance:approve',
    'procurement:read',
    'project:read',
    'analytics:read',
  ],
  [CosRole.SAFETY_OFFICER]: [
    'site-ops:read',
    'site-ops:write',
    'inspection:read',
    'inspection:write',
    'inspection:approve',
    'project:read',
  ],
  [CosRole.SITE_ENGINEER]: [
    'site-ops:read',
    'site-ops:write',
    'inspection:read',
    'inspection:write',
    'issue:read',
    'issue:write',
    'project:read',
  ],
  [CosRole.CRM_SALES_MANAGER]: ['project:read', 'crm:read', 'crm:write'],
  // ── Spec §6.8 implementation sub-roles ───────────────────────────────────
  // PROC_MANAGER: PROCUREMENT_OFFICER + approve authority (§32.6 RFQ EVALUATED→AWARDED/CANCELLED)
  [CosRole.PROC_MANAGER]: [
    'procurement:read',
    'procurement:write',
    'procurement:approve',
    'vendor:read',
    'vendor:write',
    'boq:read',
    'project:read',
  ],
  // SITE_WORKER: field worker subset of SITE_ENGINEER (spec §6.8)
  [CosRole.SITE_WORKER]: [
    'project:read',
    'task:read',
    'task:write',
    'site-ops:read',
    'site-ops:write',
    'issue:read',
    'issue:write',
    'safety:read',
    'safety:write',
  ],
  // VIEWER: read-only across all modules, scoped to project assignment (spec §6.8).
  //
  // SEVEN GRANTS UNTIL 2026-09-10, when `safety:read`, `analytics:read` and `ai:read` were added by
  // product-owner decision (ADR-102). The role's five mobile screens draw a safety panel, an
  // analytics page and two AI cards, and a screen rendering a module the matrix denies is the UI
  // asserting an entitlement the guard would refuse. All three are `:read`, so §20.7.9's "no
  // create/edit/approve actions are rendered" is unchanged and no write surface is opened.
  [CosRole.VIEWER]: [
    'project:read',
    'boq:read',
    'task:read',
    'site-ops:read',
    'issue:read',
    'procurement:read',
    'finance:read',
    'safety:read',
    'analytics:read',
    'ai:read',
  ],
};
