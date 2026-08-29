/**
 * Phase 5 Generate items 02, 09, 12 and QM-1's mutation gate
 * — master:2466, 2470, 2518; context.md QM-1
 */
import * as fs from 'fs';
import * as path from 'path';
import { exists, read, repoRoot } from '../helpers';

const MODULE = 'backend/src/modules/procurement';

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
const readRel = (f: string): string => read(`${MODULE}/${f}`);
const srcCorpus = src.map(readRel).join('\n');

/**
 * Strip the literal text of template literals, keeping only the `${...}` expressions.
 *
 * Money arithmetic inside a $queryRaw template is SQL, evaluated by PostgreSQL on `numeric`
 * columns — that is exact decimal arithmetic and exactly what the spec wants. Only JavaScript
 * arithmetic is forbidden (master:981, 991), so the SQL text must not be scanned or every
 * `AVG(min_amount / total_amount)` reads as a violation.
 */
const javascriptOnly = (source: string): string =>
  source.replace(/`(?:[^`\\]|\\.)*`/gs, (lit) =>
    Array.from(lit.matchAll(/\$\{([\s\S]*?)\}/g))
      .map((m) => m[1])
      .join('\n'),
  );

describe('Phase 5 · procurement module layers (master:2466)', () => {
  it('backend/src/modules/procurement exists', () => {
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

describe('Phase 5 · decimal.js for every money calculation (master:2518; master:981)', () => {
  it('the module uses decimal.js or @cos/financial', () => {
    expect(srcCorpus).toMatch(/from ['"]decimal\.js['"]|from ['"]@cos\/financial['"]/);
  });

  it('no money identifier goes through parseFloat or Number()', () => {
    const offenders: string[] = [];
    for (const f of src) {
      for (const m of javascriptOnly(readRel(f)).matchAll(
        /(parseFloat|Number)\s*\(\s*([A-Za-z_.[\]']*)/g,
      )) {
        if (/amount|cost|total|price|quantity|rate/i.test(m[2])) offenders.push(`${f}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no raw arithmetic operator is applied to a money identifier', () => {
    const offenders: string[] = [];
    for (const f of src) {
      for (const m of javascriptOnly(readRel(f)).matchAll(
        /\b([a-z_]*(?:amount|cost|total|price|quantity)[a-z_]*)\s*[*+\-/]\s*[a-z_]/gi,
      )) {
        offenders.push(`${f}: ${m[0].trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('Phase 5 · DTO validation (master:2470)', () => {
  const dtos = src.filter((f) => f.endsWith('.dto.ts'));

  it('the module ships DTOs', () => {
    expect(dtos.length).toBeGreaterThan(0);
  });

  it.each(dtos)('%s imports class-validator', (f) => {
    expect(readRel(f)).toMatch(/from ['"]class-validator['"]/);
  });

  it('money fields are not validated as @IsNumber (master:991)', () => {
    const offenders: string[] = [];
    for (const f of dtos) {
      const lines = readRel(f).split('\n');
      lines.forEach((line, i) => {
        if (!/@IsNumber\s*\(/.test(line)) return;
        if (/amount|cost|total|price/i.test(lines.slice(i + 1, i + 4).join(' '))) {
          offenders.push(`${f}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe('QM-1 · mutation testing covers the approval flow (context.md QM-1)', () => {
  /** "procurement approval flows ... mutation testing required; mutation score >= 70%" */
  interface StrykerCfg {
    mutate?: string[];
    thresholds?: { break?: number };
  }
  const cfg = JSON.parse(read('backend/stryker.config.json')) as StrykerCfg;
  const mutate = (cfg.mutate ?? []).join('\n');

  it.each(['procurement.service.ts', 'po.activities.ts', 'rfq.activities.ts'])(
    '%s is in the mutate set',
    (file) => {
      expect(mutate).toContain(file);
    },
  );

  it('the break threshold is at least 70', () => {
    expect(cfg.thresholds?.break).toBeGreaterThanOrEqual(70);
  });
});
