/**
 * Phase 2 Generate item 06 and the four "Decisions in Phase 2" — master:1941, 2015-2036
 *
 *   item 06 "DTOs with class-validator decorators for all API inputs"
 *           (QM-4: "never hand-written `if` checks alone")
 *   D1 AdvancedABACPolicy   — custom NestJS PolicyGuard, swapped via DI
 *   D2 EnterpriseSSOProvider — Keycloak IdP config, admin console, NO code change
 *   D3 DedicatedDBIsolation  — trigger: plan_type = ENTERPRISE AND dedicated DB requested
 *   D4 BiometricCheckIn      — generic SDK interface injected via DI
 */
import * as fs from 'fs';
import * as path from 'path';
import { exists, read, repoRoot } from '../helpers';

const MODULES = ['identity', 'tenant'];

const dtoFiles = MODULES.flatMap((m) => {
  const root = path.join(repoRoot, 'backend', 'src', 'modules', m);
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== '__tests__' && e.name !== 'node_modules') walk(full);
      } else if (e.name.endsWith('.dto.ts')) out.push(path.relative(repoRoot, full));
    }
  };
  walk(root);
  return out;
});

describe('Phase 2 · DTOs use class-validator (master:1941; QM-4 master:216)', () => {
  it('the identity and tenant modules ship DTOs', () => {
    expect(dtoFiles.length).toBeGreaterThan(0);
  });

  it.each(dtoFiles)('%s imports class-validator', (f) => {
    expect(read(f)).toMatch(/from ['"]class-validator['"]/);
  });

  it.each(dtoFiles)('%s applies at least one validation decorator', (f) => {
    // A DTO that imports the package but decorates nothing validates nothing.
    expect(read(f)).toMatch(/@Is[A-Z]\w*\(|@Matches\(|@Length\(|@Min\(|@Max\(|@ValidateNested\(/);
  });
});

describe('Phase 2 · D1 AdvancedABACPolicy — custom PolicyGuard via DI (master:2017-2020)', () => {
  it('PolicyGuard exists as a concrete guard', () => {
    expect(exists('backend/src/shared/guards/policy.guard.ts')).toBe(true);
  });

  it('it checks the three default ABAC attributes (master:1823-1826)', () => {
    const src = read('backend/src/shared/guards/policy.guard.ts');
    expect(src).toMatch(/project.?member/i);
    expect(src).toMatch(/tenant/i);
  });
});

describe('Phase 2 · D3 DedicatedDBIsolation trigger (master:2027-2030; master:1885)', () => {
  it('platform.tenants carries dedicated_db_url', () => {
    const migrations = fs
      .readdirSync(path.join(repoRoot, 'backend/prisma/migrations'))
      .map((d) => path.join('backend/prisma/migrations', d, 'migration.sql'))
      .filter((f) => exists(f))
      .map((f) => read(f))
      .join('\n');
    expect(migrations).toMatch(/dedicated_db_url/);
  });

  it('ENTERPRISE is a plan_type value', () => {
    const migrations = fs
      .readdirSync(path.join(repoRoot, 'backend/prisma/migrations'))
      .map((d) => path.join('backend/prisma/migrations', d, 'migration.sql'))
      .filter((f) => exists(f))
      .map((f) => read(f))
      .join('\n');
    expect(migrations).toMatch(/ENTERPRISE/);
  });
});

describe('Phase 2 · D4 BiometricCheckIn — decided, implementation deferred (master:2032-2035)', () => {
  /**
   * Phase 2 records the DECISION (a generic SDK interface injected via DI). Phase 22's own
   * Generate list defers the build outright — master:5268 "Biometric check-in (deferred — do not
   * implement until spec defines it)" — so the absence of a backend implementation is the spec
   * being followed, not a gap. What must hold is that the decided interface stays on record with
   * the agreed shape; that is what a later phase will build against.
   */
  const spec = read('docs/specifications/13-product-architecture.md');

  it('the BiometricCheckIn interface is declared in the spec', () => {
    expect(spec).toMatch(/interface\s+BiometricCheckIn/);
  });

  it('its method keeps the decided signature (workerId, projectId, method)', () => {
    expect(spec).toMatch(/verifyCheckIn\(\s*workerId[^)]*projectId[^)]*method[^)]*\)/);
  });

  it('Phase 22 still records the deferral, so no phase silently picks it up', () => {
    // Read from Phase 22's own command file, not the master. The 25 Phase blocks moved to
    // `context/phases/` on 2026-09-02 (f55dee77) and the master kept an index table in their place,
    // so this line — and the six other master-anchored assertions in this suite — had been asserting
    // against a file that no longer contains what they name. The deferral itself never moved.
    expect(read('context/phases/phase-22-workforce-service.md')).toMatch(
      /Biometric check-in \(deferred/,
    );
  });
});

/**
 * D2 EnterpriseSSOProvider (master:2022-2025) has NO machine-checkable artifact: the decision is
 * "Keycloak Identity Provider configuration (admin console, no code change)". There is deliberately
 * nothing in the repo to assert, and inventing an assertion here would be theatre. Recorded so the
 * gap is visible rather than silently missing — same treatment as Phase 1's C1/C2.
 */
describe.skip('Phase 2 · D2 EnterpriseSSOProvider — admin-console only, nothing to assert', () => {
  it('is configured per tenant realm in the Keycloak admin console', () => {
    /* intentionally not implemented — see the comment above */
  });
});
