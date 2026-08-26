/**
 * Phase 1 Generate item 2 — master:1674-1683
 *
 *   "root pnpm-workspace.yaml listing every workspace member: apps/*, backend,
 *    services/*, packages/@cos/*"
 *   "apps/mobile is explicitly EXCLUDED via !apps/mobile"
 *   "apps/mobile/pnpm-workspace.yaml sets nodeLinker: hoisted (pnpm 10/11 reads the
 *    linker setting there, NOT apps/mobile/.npmrc)"
 *   "consuming @cos/types as a file: dependency"
 *   "Nothing in turbo/CI references @cos/mobile"
 */
import * as fs from 'fs';
import * as path from 'path';
import { abs, exists, read, readYaml, readJson, repoRoot } from '../helpers';

interface PnpmWorkspace {
  packages?: string[];
  nodeLinker?: string;
}

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

describe('Phase 1 · root pnpm-workspace.yaml (master:1674-1675)', () => {
  const ws = readYaml<PnpmWorkspace>('pnpm-workspace.yaml');

  it.each(['apps/*', 'backend', 'services/*', 'packages/@cos/*'])(
    'lists workspace member %s',
    (member) => {
      expect(ws.packages).toContain(member);
    },
  );
});

describe('Phase 1 · mobile workspace exception (master:1676-1683)', () => {
  it('root workspace excludes apps/mobile via !apps/mobile', () => {
    const ws = readYaml<PnpmWorkspace>('pnpm-workspace.yaml');
    expect(ws.packages).toContain('!apps/mobile');
  });

  it('apps/mobile is its own pnpm workspace', () => {
    expect(exists('apps/mobile/pnpm-workspace.yaml')).toBe(true);
  });

  it('apps/mobile/pnpm-workspace.yaml sets nodeLinker: hoisted', () => {
    const mobileWs = readYaml<PnpmWorkspace>('apps/mobile/pnpm-workspace.yaml');
    expect(mobileWs.nodeLinker).toBe('hoisted');
  });

  it('apps/mobile consumes @cos/types as a file: dependency', () => {
    const pkg = readJson<PackageJson>('apps/mobile/package.json');
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(deps['@cos/types']).toBeDefined();
    expect(deps['@cos/types']).toMatch(/^file:/);
  });

  it('turbo.json does not reference @cos/mobile', () => {
    expect(read('turbo.json')).not.toMatch(/@cos\/mobile/);
  });

  it('CI workflow does not reference @cos/mobile', () => {
    expect(read('.github/workflows/ci.yml')).not.toMatch(/@cos\/mobile/);
  });
});

// ── the tooling floor (master:1650-1660) ───────────────────────────────────
//
// The spec fixes a major line for each tool, and the reason it fixes them is that they are not
// interchangeable: TypeScript 6 is where `moduleResolution: node10` stops working (this repo hit
// that on 2026-08-26), ESLint 10 is flat-config-only, and pnpm 11 is where the workspace linker
// setting moved into pnpm-workspace.yaml — which is the whole basis of the apps/mobile exclusion
// asserted above.
//
// None of these was checked anywhere before 2026-08-26. A major-version drift is not something a
// test suite notices: everything keeps passing on the version that is installed, and the failure
// arrives on whoever installs next.

describe('the toolchain sits on the majors the spec names (master:1650-1660)', () => {
  const rootPkg = readJson<{
    engines?: Record<string, string>;
    packageManager?: string;
    devDependencies?: Record<string, string>;
  }>('package.json');

  it('requires Node 24 or newer (master:1650)', () => {
    expect(rootPkg.engines?.['node']).toBe('>=24.0.0');
  });

  it('requires pnpm 11 or newer, and pins an 11.x build (master:1651-1654)', () => {
    // The spec is explicit that only the MAJOR is normative — "a patch/minor bump is not a spec
    // deviation" — so the pin is matched on its major alone, and the floor on its exact wording.
    expect(rootPkg.engines?.['pnpm']).toBe('>=11.0.0');
    expect(rootPkg.packageManager).toMatch(/^pnpm@11\./);
  });

  it.each([
    ['turbo', /^\^?2\./, 'Turborepo 2.x (master:1655)'],
    ['typescript', /^\^?6\./, 'TypeScript 6.x (master:1656)'],
    ['eslint', /^\^?10\./, 'ESLint 10.x flat config (master:1657)'],
    ['prettier', /^\^?3\./, 'Prettier 3.x (master:1658)'],
    ['husky', /^\^?9\./, 'Husky 9.x (master:1659)'],
  ])('%s is on the major the spec names — %s', (dep, major) => {
    const range = rootPkg.devDependencies?.[dep];
    expect(range).toBeDefined();
    expect(range).toMatch(major);
  });
});

// ── what packages/ must NOT contain (master:1606-1607) ─────────────────────

describe('shared packages hold no module-specific code (master:1606-1607)', () => {
  it('contains no repository or DTO files', () => {
    // "Does NOT belong in packages/: business logic, module-specific DTOs, module-specific
    // repositories." A repository in a shared package binds every consumer to one module's schema,
    // and the coupling is invisible from either side — the package still builds, the module still
    // works, and the boundary is gone. Only an absence check states it.
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(repository|dto)\.ts$/.test(entry.name)) {
          offenders.push(path.relative(repoRoot, full));
        }
      }
    };
    walk(abs('packages/@cos'));
    expect(offenders).toEqual([]);
  });
});
