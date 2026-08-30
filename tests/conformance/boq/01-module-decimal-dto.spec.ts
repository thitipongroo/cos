/**
 * Phase 4 Generate items 02, 03, 05, 07 — master:2317-2322
 *
 *   item 02 "NestJS module, service, repository, controller"
 *   item 03 "Decimal.js calculation service (unit-tested)"
 *   item 05 "DTOs with financial field validation"
 *   item 07 "Unit tests: calculation accuracy (test: 0.1 + 0.2 precision, edge cases)"
 *
 * FINANCIAL PRECISION SPEC (master:979-992) is the rule behind items 03/05:
 *   "TypeScript/Node.js: use 'decimal.js' library — never use native JS floats"
 *   "Never use JavaScript Number for monetary calculations"
 */
import * as fs from 'fs';
import * as path from 'path';
import { exists, read, repoRoot } from '../helpers';

const MODULE = 'backend/src/modules/boq';

const filesUnder = (rel: string): string[] => {
  const dir = path.join(repoRoot, rel);
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules') walk(full);
      } else out.push(path.relative(path.join(repoRoot, rel), full));
    }
  };
  walk(dir);
  return out;
};

const all = filesUnder(MODULE);
const src = all.filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));
const specs = all.filter((f) => f.endsWith('.spec.ts'));
const readRel = (f: string): string => read(`${MODULE}/${f}`);
const srcCorpus = src.map(readRel).join('\n');

describe('Phase 4 · boq module layers (master:2317)', () => {
  it('backend/src/modules/boq exists', () => {
    expect(exists(MODULE)).toBe(true);
  });

  it.each([
    ['module', /\.module\.ts$/],
    ['service', /\.service\.ts$/],
    ['repository', /\.repository\.ts$/],
    ['controller', /\.controller\.ts$/],
  ])('ships a %s layer', (_label, pattern) => {
    expect(src.some((f) => pattern.test(f))).toBe(true);
  });
});

describe('Phase 4 · decimal.js is the arithmetic (master:2318; master:981)', () => {
  it('the module uses decimal.js', () => {
    expect(srcCorpus).toMatch(
      /from ['"]decimal\.js['"]|require\(['"]decimal\.js['"]\)|@cos\/financial/,
    );
  });

  it('rounds HALF_UP as the spec fixes (master:2294)', () => {
    // "Rounding mode: HALF_UP throughout — use decimal.js ROUND_HALF_UP constant"
    const financial = read('packages/@cos/financial/src/index.ts');
    expect(`${srcCorpus}\n${financial}`).toMatch(/ROUND_HALF_UP/);
  });

  it('no money field is put through parseFloat or Number()', () => {
    const offenders: string[] = [];
    for (const f of src) {
      const body = readRel(f);
      for (const m of body.matchAll(/(parseFloat|Number)\s*\(\s*([A-Za-z_.[\]']*)/g)) {
        const arg = m[2];
        if (/amount|cost|total|price|quantity|subtotal/i.test(arg)) offenders.push(`${f}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('Phase 4 · DTOs validate financial fields as strings (master:2320)', () => {
  const dtos = src.filter((f) => f.endsWith('.dto.ts'));

  it('the module ships DTOs', () => {
    expect(dtos.length).toBeGreaterThan(0);
  });

  it.each(dtos)('%s imports class-validator', (f) => {
    expect(readRel(f)).toMatch(/from ['"]class-validator['"]/);
  });

  it('money fields are never validated as @IsNumber (master:991 — no JS Number for money)', () => {
    const offenders: string[] = [];
    for (const f of dtos) {
      const lines = readRel(f).split('\n');
      lines.forEach((line, i) => {
        if (!/@IsNumber\s*\(/.test(line)) return;
        const following = lines.slice(i + 1, i + 4).join(' ');
        if (/amount|cost|total|price/i.test(following)) offenders.push(`${f}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe('Phase 4 · the calculation test the spec names (master:2322)', () => {
  /**
   * master:2322 does not say "test the calculations" — it names the case:
   * "test: 0.1 + 0.2 precision, edge cases". That case exists because 0.1 + 0.2 !== 0.3 in IEEE
   *754, so its presence is the evidence that float error was actually considered.
   */
  const specCorpus = specs.map(readRel).join('\n');
  const financialSpecs = ((): string => {
    const dir = path.join(repoRoot, 'packages/@cos/financial/src');
    if (!fs.existsSync(dir)) return '';
    const out: string[] = [];
    const walk = (d: string): void => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (full.endsWith('.spec.ts')) out.push(full);
      }
    };
    walk(dir);
    return out.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  })();

  it('the module ships unit tests', () => {
    expect(specs.length).toBeGreaterThan(0);
  });

  it('a 0.1 + 0.2 precision case exists', () => {
    expect(`${specCorpus}\n${financialSpecs}`).toMatch(/0\.1[\s\S]{0,40}0\.2/);
  });
});
