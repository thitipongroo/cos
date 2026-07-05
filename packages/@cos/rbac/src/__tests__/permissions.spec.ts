// Unit tests for @cos/rbac — ROLE_PERMISSIONS and decorators

import { CosRole } from '@cos/types';
import { ROLE_PERMISSIONS } from '../permissions';
import { ROLES_KEY, PERMISSIONS_KEY, Roles, RequirePermissions } from '../decorators';

describe('ROLE_PERMISSIONS', () => {
  it('SYSTEM_ADMIN has wildcard permission', () => {
    expect(ROLE_PERMISSIONS[CosRole.SYSTEM_ADMIN]).toContain('*:*');
  });

  it('TENANT_ADMIN has wildcard permission', () => {
    expect(ROLE_PERMISSIONS[CosRole.TENANT_ADMIN]).toContain('*:*');
  });

  it('SITE_WORKER cannot approve procurement', () => {
    const perms = ROLE_PERMISSIONS[CosRole.SITE_WORKER];
    expect(perms.some((p) => p.includes('approve') && p.includes('procurement'))).toBe(false);
  });

  it('FINANCE has finance:approve permission', () => {
    expect(ROLE_PERMISSIONS[CosRole.FINANCE]).toContain('finance:approve');
  });

  it('EXECUTIVE has read-only access across modules', () => {
    const perms = ROLE_PERMISSIONS[CosRole.EXECUTIVE];
    const writePerms = perms.filter((p) => p.endsWith(':write') || p.endsWith(':manage'));
    expect(writePerms.length).toBe(0);
  });

  it('PROJECT_MANAGER has project:write', () => {
    expect(ROLE_PERMISSIONS[CosRole.PROJECT_MANAGER]).toContain('project:write');
  });

  it('all 12 roles (9 spec + 3 sub-roles) are defined', () => {
    const allRoles = [
      CosRole.SYSTEM_ADMIN,
      CosRole.TENANT_ADMIN,
      CosRole.EXECUTIVE,
      CosRole.PROJECT_MANAGER,
      CosRole.PROCUREMENT_OFFICER,
      CosRole.FINANCE,
      CosRole.SAFETY_OFFICER,
      CosRole.SITE_ENGINEER,
      CosRole.CRM_SALES_MANAGER,
      CosRole.PROC_MANAGER,
      CosRole.SITE_WORKER,
      CosRole.VIEWER,
    ];
    allRoles.forEach((role) => {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
      expect(Array.isArray(ROLE_PERMISSIONS[role])).toBe(true);
    });
  });

  it('PROC_MANAGER has procurement:approve (RFQ EVALUATED→AWARDED authority — spec §32.6)', () => {
    expect(ROLE_PERMISSIONS[CosRole.PROC_MANAGER]).toContain('procurement:approve');
  });

  it('PROC_MANAGER has all PROCUREMENT_OFFICER permissions', () => {
    const procOfficerPerms = ROLE_PERMISSIONS[CosRole.PROCUREMENT_OFFICER];
    const procManagerPerms = ROLE_PERMISSIONS[CosRole.PROC_MANAGER];
    procOfficerPerms.forEach((p) => {
      expect(procManagerPerms).toContain(p);
    });
  });

  it('SITE_WORKER has task:write (spec §6.8)', () => {
    expect(ROLE_PERMISSIONS[CosRole.SITE_WORKER]).toContain('task:write');
  });

  it('SITE_WORKER does not have inspection:write', () => {
    expect(ROLE_PERMISSIONS[CosRole.SITE_WORKER]).not.toContain('inspection:write');
  });

  it('VIEWER has finance:read (spec §6.8)', () => {
    expect(ROLE_PERMISSIONS[CosRole.VIEWER]).toContain('finance:read');
  });

  it('VIEWER has no write or approve permissions', () => {
    const perms = ROLE_PERMISSIONS[CosRole.VIEWER];
    const nonReadPerms = perms.filter((p) => !p.endsWith(':read'));
    expect(nonReadPerms).toHaveLength(0);
  });
});

describe('ROLE_PERMISSIONS — exact matrix pin (mutation gate)', () => {
  // Pins the full spec §6.4/§6.8 matrix so any mutation (added, removed, or altered
  // permission string) fails this test. Update BOTH the matrix and this pin on a spec change.
  it('matches the spec permission matrix exactly', () => {
    expect(ROLE_PERMISSIONS).toEqual({
      [CosRole.SYSTEM_ADMIN]: ['*:*'],
      [CosRole.TENANT_ADMIN]: ['*:*'],
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
      [CosRole.PROC_MANAGER]: [
        'procurement:read',
        'procurement:write',
        'procurement:approve',
        'vendor:read',
        'vendor:write',
        'boq:read',
        'project:read',
      ],
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
      [CosRole.VIEWER]: [
        'project:read',
        'boq:read',
        'task:read',
        'site-ops:read',
        'issue:read',
        'procurement:read',
        'finance:read',
      ],
    });
  });
});

describe('@Roles decorator', () => {
  it('sets ROLES_KEY metadata on target', () => {
    class TestController {
      @Roles(CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN)
      getProjects(): void {}
    }
    const meta = Reflect.getMetadata(ROLES_KEY, TestController.prototype.getProjects);
    expect(meta).toEqual([CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN]);
  });
});

describe('@RequirePermissions decorator', () => {
  it('sets PERMISSIONS_KEY metadata on target', () => {
    class TestController {
      @RequirePermissions('project:read', 'boq:write')
      createBoq(): void {}
    }
    const meta = Reflect.getMetadata(PERMISSIONS_KEY, TestController.prototype.createBoq);
    expect(meta).toEqual(['project:read', 'boq:write']);
  });
});
