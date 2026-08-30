/**
 * Phase 2 Generate item 11 — master:1962
 *
 *   "Unit tests: guards, middleware, token validation"
 *
 * The obligation is that each of those three surfaces is unit-tested, so this asserts a spec file
 * accompanies every source file in them. QM-1's 100/100 gate proves the LINES are executed; it
 * cannot prove a given file has tests of its own, because another file's spec can incidentally
 * cover it. That is the gap this closes.
 */
import * as fs from 'fs';
import * as path from 'path';
import { repoRoot } from '../helpers';

const SURFACES: ReadonlyArray<[string, string]> = [
  ['guards', 'backend/src/shared/guards'],
  ['middleware', 'backend/src/shared/middleware'],
  ['token validation (strategies)', 'backend/src/modules/identity/strategies'],
];

/** Source files in `dir`, excluding specs, barrels and type-only modules. */
const sourcesIn = (rel: string): string[] => {
  const dir = path.join(repoRoot, rel);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter(
      (n) =>
        n.endsWith('.ts') &&
        !n.endsWith('.spec.ts') &&
        !n.endsWith('.d.ts') &&
        !n.endsWith('.interface.ts') &&
        n !== 'index.ts',
    );
};

/**
 * A file is unit-tested when a spec anywhere under backend/src carries its name. The repo puts
 * `__tests__/` at the MODULE root rather than beside each subdirectory — e.g. the strategy in
 * modules/identity/strategies/ is specced at modules/identity/__tests__/ — so a sibling-only
 * lookup would report a false gap.
 */
const allSpecNames = ((): Set<string> => {
  const names = new Set<string>();
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules') walk(full);
      } else if (e.name.endsWith('.spec.ts')) {
        names.add(e.name);
      }
    }
  };
  walk(path.join(repoRoot, 'backend', 'src'));
  return names;
})();

const hasUnitSpec = (_rel: string, file: string): boolean =>
  allSpecNames.has(file.replace(/\.ts$/, '.spec.ts'));

describe.each(SURFACES)('Phase 2 · %s are unit-tested (master:1962)', (_label, dir) => {
  const files = sourcesIn(dir);

  it(`${dir} contains source to test`, () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.length ? files : ['<none>'])('%s has a unit spec', (file) => {
    if (file === '<none>') return;
    expect(hasUnitSpec(dir, file)).toBe(true);
  });
});

describe('Phase 2 · the Phase-2 modules ship unit tests at all (master:1962)', () => {
  it.each(['identity', 'tenant'])('backend/src/modules/%s has spec files', (mod) => {
    const root = path.join(repoRoot, 'backend', 'src', 'modules', mod);
    const found: string[] = [];
    const walk = (d: string): void => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.spec.ts')) found.push(full);
      }
    };
    walk(root);
    expect(found.length).toBeGreaterThan(0);
  });
});
