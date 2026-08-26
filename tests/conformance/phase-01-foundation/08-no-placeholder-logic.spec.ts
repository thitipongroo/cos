/**
 * Phase 1 Constraint C3 — master:1744
 *
 *   "no demo code, no placeholder business logic"
 *
 * Scoped by spec §32.9 (master:748-753, 5618-5620): a DECLARED Integration Stub is
 * required behaviour, not placeholder logic — "Type A ... log WARN + throw typed
 * exception". Such a stub is legitimate only when it is traceable: it lives in a
 * *.stub.ts file, or it cites the spec section / ADR that sanctions it (Rule 29).
 *
 * An untraceable "not implemented" is exactly the demo code C3 forbids.
 */
import * as fs from 'fs';
import * as path from 'path';
import { repoRoot } from '../helpers';

const SOURCE_ROOTS = ['backend/src', 'packages/@cos'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '__tests__', '.turbo']);

const isProductionSource = (file: string): boolean =>
  file.endsWith('.ts') &&
  !file.endsWith('.spec.ts') &&
  !file.endsWith('.stub.ts') &&
  !file.endsWith('.d.ts');

const walk = (dir: string, acc: string[] = []): string[] => {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), acc);
    } else if (isProductionSource(entry.name)) {
      acc.push(path.join(dir, entry.name));
    }
  }
  return acc;
};

const sourceFiles = SOURCE_ROOTS.flatMap((r) => walk(path.join(repoRoot, r)));

const PLACEHOLDER_MARKERS: ReadonlyArray<[string, RegExp]> = [
  ['not implemented', /\bnot\s+implemented\b/i],
  ['NotImplementedError', /NotImplementedError/],
  ['placeholder logic', /placeholder\s+(logic|implementation|business)/i],
  ['demo-only marker', /\b(demo\s+only|for\s+demo\s+purposes)\b/i],
];

/** §32.9 stub, or an ADR that sanctions the non-implementation (Rule 29). */
const SANCTION = /§\s*32\.9|ADR-\d{3}|Type\s+A\s+stub|Type\s+B\s+stub/;

describe('Phase 1 · C3 no demo code, no placeholder business logic (master:1744)', () => {
  it('finds production source to scan', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it.each(PLACEHOLDER_MARKERS)(
    'every "%s" marker is a declared, traceable stub (§32.9 / ADR)',
    (_label, pattern) => {
      const untraceable = sourceFiles
        .filter((f) => {
          const body = fs.readFileSync(f, 'utf8');
          return pattern.test(body) && !SANCTION.test(body);
        })
        .map((f) => path.relative(repoRoot, f));
      expect(untraceable).toEqual([]);
    },
  );
});
