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
import { exists, read, readYaml, readJson } from '../helpers';

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
