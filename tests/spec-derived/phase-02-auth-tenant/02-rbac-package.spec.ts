/**
 * Phase 2 Generate item 04 — master:1934-1939, with the role list from master:1792-1812
 * and the permission-granularity rule from master:1813.
 *
 *   "@cos/rbac contains: CosRole enum, ROLE_PERMISSIONS map, @Roles/@RequirePermissions
 *    decorators, ROLES_KEY/PERMISSIONS_KEY metadata constants — NOT concrete CanActivate
 *    implementations; concrete guards RolesGuard and PolicyGuard live in
 *    backend/src/shared/guards/ ... (source: spec §06-rbac-permission-matrix §6.9)"
 */
import * as rbac from '@cos/rbac';
import { exists, read } from '../helpers';

/** master:1792-1801 — the nine roles spec §6.2 defines. */
const SPEC_ROLES = [
  'SYSTEM_ADMIN',
  'TENANT_ADMIN',
  'EXECUTIVE',
  'PROJECT_MANAGER',
  'PROCUREMENT_OFFICER',
  'FINANCE',
  'SAFETY_OFFICER',
  'SITE_ENGINEER',
  'CRM_SALES_MANAGER',
];

/** master:1803-1806 — implementation sub-roles, not in spec §6.2. */
const SUB_ROLES = ['PROC_MANAGER', 'SITE_WORKER', 'VIEWER'];

const bag = rbac as unknown as Record<string, unknown>;
const CosRole = bag['CosRole'] as Record<string, string> | undefined;
const ROLE_PERMISSIONS = bag['ROLE_PERMISSIONS'] as Record<string, string[]> | undefined;

describe('Phase 2 · @cos/rbac exports (master:1934-1936)', () => {
  it.each([
    'CosRole',
    'ROLE_PERMISSIONS',
    'Roles',
    'RequirePermissions',
    'ROLES_KEY',
    'PERMISSIONS_KEY',
  ])('exports %s', (name) => {
    expect(bag[name]).toBeDefined();
  });

  it('Roles and RequirePermissions are decorators (callable)', () => {
    expect(typeof bag['Roles']).toBe('function');
    expect(typeof bag['RequirePermissions']).toBe('function');
  });

  it('ROLES_KEY and PERMISSIONS_KEY are distinct metadata keys', () => {
    expect(bag['ROLES_KEY']).not.toBe(bag['PERMISSIONS_KEY']);
  });
});

describe('Phase 2 · CosRole covers every specified role (master:1792-1806)', () => {
  it.each(SPEC_ROLES)('defines spec §6.2 role %s', (role) => {
    expect(Object.keys(CosRole ?? {})).toContain(role);
  });

  it.each(SUB_ROLES)('defines implementation sub-role %s', (role) => {
    expect(Object.keys(CosRole ?? {})).toContain(role);
  });

  it('does NOT define VENDOR_PORTAL — it is an external principal, not a CosRole (master:1808-1812)', () => {
    expect(Object.keys(CosRole ?? {})).not.toContain('VENDOR_PORTAL');
  });
});

describe('Phase 2 · ROLE_PERMISSIONS (master:1813)', () => {
  const entries = Object.entries(ROLE_PERMISSIONS ?? {});

  it('maps every role in CosRole', () => {
    const mapped = Object.keys(ROLE_PERMISSIONS ?? {});
    for (const role of Object.values(CosRole ?? {})) {
      expect(mapped).toContain(role);
    }
  });

  it('is not empty', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it('every permission uses resource:action granularity', () => {
    // master:1813 — "Permission granularity: resource:action (e.g. project:read, boq:write)".
    // `*` is legal on either side: `*:*` is the SYSTEM_ADMIN platform-admin grant.
    const RESOURCE_ACTION = /^(\*|[a-z0-9_-]+):(\*|[a-z0-9_-]+)$/;
    const bad: string[] = [];
    for (const [role, perms] of entries) {
      for (const p of perms) {
        if (!RESOURCE_ACTION.test(p)) bad.push(`${role} -> ${p}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the unrestricted grant is spelled *:*, never a bare *', () => {
    const all = new Set(entries.flatMap(([, perms]) => perms));
    expect(all.has('*')).toBe(false);
  });
});

describe('Phase 2 · guard placement, spec §6.9 (master:1936-1939)', () => {
  it('the package ships NO concrete CanActivate implementation', () => {
    const src = read('packages/@cos/rbac/src/index.ts');
    expect(src).not.toMatch(/implements\s+CanActivate/);
  });

  it.each([
    ['RolesGuard', 'roles.guard.ts'],
    ['PolicyGuard', 'policy.guard.ts'],
  ])('%s is implemented under backend/src/shared/guards/', (guard, file) => {
    expect(exists(`backend/src/shared/guards/${file}`)).toBe(true);
    expect(read(`backend/src/shared/guards/${file}`)).toMatch(
      new RegExp(`class\\s+${guard}\\b[\\s\\S]*implements\\s+CanActivate`),
    );
  });
});
