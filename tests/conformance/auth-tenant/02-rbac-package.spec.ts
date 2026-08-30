/**
 * Phase 2 — where the RBAC guards live. CONFORMANCE only.
 *
 * spec §6.9 splits one mechanism across two packages: @cos/rbac ships the CosRole enum, the
 * ROLE_PERMISSIONS map, the @Roles/@RequirePermissions decorators and their metadata keys — and
 * deliberately NO concrete CanActivate. The guards that read that metadata live in
 * backend/src/shared/guards/. Nothing loads both sides in one process, and each half looks complete
 * on its own: a package with a guard in it would work, and a backend with no guard would simply
 * admit everyone while every @Roles decorator kept reading as protection.
 *
 * The package's own exports, role list, permission granularity and the VENDOR_PORTAL exclusion used
 * to be asserted here too. They are unit tests — this file imported and executed the package — so
 * they moved into packages/@cos/rbac/src/__tests__/permissions.spec.ts, beside the code they run
 * (2026-08-25).
 */
import { exists, read } from '../helpers';

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
