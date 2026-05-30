import { CosRole } from '@cos/types';

// Permission format: resource:action
// Example: 'project:read', 'boq:write', 'finance:approve'

export type Permission = string;

export const ROLE_PERMISSIONS: Record<CosRole, Permission[]> = {
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
};
