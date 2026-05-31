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
    const perms = ROLE_PERMISSIONS[CosRole.SITE_ENGINEER];
    expect(perms.some(p => p.includes('approve') && p.includes('procurement'))).toBe(false);
  });

  it('FINANCE has finance:approve permission', () => {
    expect(ROLE_PERMISSIONS[CosRole.FINANCE]).toContain('finance:approve');
  });

  it('EXECUTIVE has read-only access across modules', () => {
    const perms = ROLE_PERMISSIONS[CosRole.EXECUTIVE];
    const writePerms = perms.filter(p => p.endsWith(':write') || p.endsWith(':manage'));
    expect(writePerms.length).toBe(0);
  });

  it('PROJECT_MANAGER has project:write', () => {
    expect(ROLE_PERMISSIONS[CosRole.PROJECT_MANAGER]).toContain('project:write');
  });

  it('all 9 spec roles are defined', () => {
    const specRoles = [
      CosRole.SYSTEM_ADMIN, CosRole.TENANT_ADMIN, CosRole.EXECUTIVE,
      CosRole.PROJECT_MANAGER, CosRole.PROCUREMENT_OFFICER, CosRole.FINANCE,
      CosRole.SAFETY_OFFICER, CosRole.SITE_ENGINEER, CosRole.CRM_SALES_MANAGER,
    ];
    specRoles.forEach(role => {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
      expect(Array.isArray(ROLE_PERMISSIONS[role])).toBe(true);
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
