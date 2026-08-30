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

// ── shape invariants across the whole matrix ────────────────────────────────
//
// Absorbed from tests/spec-derived/phase-02-auth-tenant/02-rbac-package.spec.ts when that file was
// deleted (2026-08-25). It imported and executed this package, so it was a unit test living outside
// the package; everything else it asserted was already covered above. These four were not, and each
// is a statement about what is ABSENT — the shape no single role's test can see.

describe('the permission matrix as a whole', () => {
  const entries = Object.entries(ROLE_PERMISSIONS);

  it('does NOT define VENDOR_PORTAL as a role (master:1808-1812)', () => {
    // A vendor is an EXTERNAL principal authenticated by a magic link, not a tenant user. Minting a
    // CosRole for it would put it inside the tenant role hierarchy, where @Roles could grant it
    // anything an internal role has.
    expect(Object.keys(CosRole)).not.toContain('VENDOR_PORTAL');
  });

  it('spells every permission as resource:action (master:1813)', () => {
    // "Permission granularity: resource:action (e.g. project:read, boq:write)". `*` is legal on
    // either side. A permission that does not parse is never granted by any check and never fails
    // loudly either — it simply denies, and the role quietly loses access it was meant to have.
    const RESOURCE_ACTION = /^(\*|[a-z0-9_-]+):(\*|[a-z0-9_-]+)$/;
    const bad: string[] = [];
    for (const [role, perms] of entries) {
      for (const p of perms) {
        if (!RESOURCE_ACTION.test(p)) bad.push(`${role} -> ${p}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('never spells the unrestricted grant as a bare *', () => {
    // `*:*` is the platform-admin grant. A bare `*` fails the resource:action parse above, so a
    // check comparing against it would silently deny SYSTEM_ADMIN everything.
    const all = new Set(entries.flatMap(([, perms]) => perms));
    expect(all.has('*')).toBe(false);
  });

  it('maps every role CosRole declares', () => {
    // A role with no entry resolves to undefined, and a permission check against undefined denies
    // without error — the role exists, logs in, and can do nothing.
    const mapped = Object.keys(ROLE_PERMISSIONS);
    for (const role of Object.values(CosRole)) {
      expect(mapped).toContain(role);
    }
  });
});
