import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Two regression guards for facts that were MEASURED on this package, not assumed:
//
//   1. Importing the classic `zod` entry instead of `zod/mini` costs 64,996 B gzipped vs 4,165 B.
//   2. Shipping only a CommonJS build defeats tree-shaking: the identical source measured
//      69,352 B gzipped as CJS and 6,905 B as ESM — a 10x difference. With the /login Lighthouse
//      budget at 256,000 B and 192,554 B already used, the CJS path alone overruns it by 51,346 B.
//
// Both regressions are silent — the code still works, the bundle just balloons — so they are
// asserted here rather than left to review.

const SRC = join(__dirname, '..');
const PKG = JSON.parse(readFileSync(join(SRC, '..', 'package.json'), 'utf8')) as {
  exports: Record<string, Record<string, string>>;
  module?: string;
  sideEffects?: boolean;
};

const sourceFiles = readdirSync(SRC).filter((f) => f.endsWith('.ts'));

describe('zod entry point', () => {
  it('has source files to check', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it.each(sourceFiles)('%s imports zod/mini, never the classic zod entry', (file) => {
    const body = readFileSync(join(SRC, file), 'utf8');
    const imports = [...body.matchAll(/from\s+'(zod[^']*)'/g)].map((m) => m[1]);
    for (const spec of imports) expect(spec).toBe('zod/mini');
  });
});

describe('package entry points', () => {
  it('resolves bundlers to the ESM build', () => {
    expect(PKG.exports['.']?.['import']).toMatch(/dist\/esm\//);
  });

  it('keeps a CommonJS build for require() consumers', () => {
    expect(PKG.exports['.']?.['require']).toMatch(/dist\/cjs\//);
  });

  it('declares `module` so older bundlers also pick ESM', () => {
    expect(PKG.module).toMatch(/dist\/esm\//);
  });

  it('is marked side-effect free so unused schemas can be dropped', () => {
    expect(PKG.sideEffects).toBe(false);
  });
});
