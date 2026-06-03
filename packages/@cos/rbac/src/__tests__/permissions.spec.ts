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
