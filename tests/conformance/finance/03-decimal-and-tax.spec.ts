/**
 * Phase 7 — "Decimal.js used for all calculations" (master:2975) and the tax constraints
 * (master:2997-3001).
 *
 * WHY THIS IS A STATIC TEST AND NOT ONLY A BEHAVIOURAL ONE. A float bug in money does not show up as
 * a wrong answer on ordinary inputs; it shows up at a boundary, on one input in a hundred thousand.
 * Phase 5 found `parseFloat` picking a purchase-order approval tier and Phase 6 found `Number`
 * division deciding an 85% budget warning — both passed every behavioural test around them for
 * months. Reading the source for the forbidden constructs catches the class, not the instance.
 */
import * as fs from 'fs';
import * as path from 'path';
import { read, repoRoot } from '../helpers';

const financeDir = 'backend/src/modules/finance';

const sourceFiles = ((): Array<[string, string]> => {
  const out: Array<[string, string]> = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (!['__tests__', 'node_modules', 'dist'].includes(e.name)) walk(full);
      } else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) {
        out.push([path.relative(repoRoot, full), fs.readFileSync(full, 'utf8')]);
      }
    }
  };
  walk(path.join(repoRoot, financeDir));
  return out;
})();

/**
 * Source with comments and string literals removed.
 *
 * Both scans below need it, for the same reason from two directions: a comment that NAMES a
 * forbidden construct is not that construct — wht.service.ts now carries one explaining why
 * `Number(...)` was taken out of it — and inside a string, `openexchangerates.org` contains a hyphen
 * that reads as subtraction.
 */
const codeOnly = (body: string): string =>
  body
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    // `m` so `^` means start-of-line; without it only the first line's comment is stripped. The
    // `[^:]` guard keeps `https://` from being read as a comment.
    .replace(/(^|[^:])\/\/[^\n]*/gm, '$1 ')
    .replace(/'[^'\n]*'/g, "''")
    .replace(/"[^"\n]*"/g, '""')
    .replace(/`[^`]*`/g, '``');

/** Identifiers that are counts, page sizes or indexes — never money. */
const NON_MONETARY = /^(count|total|page|limit|offset|index|length|size|weeks?|days?)$/i;

describe('Phase 7 · Decimal for money (master:2975, 991)', () => {
  it('the service computes with Decimal', () => {
    expect(read(`${financeDir}/finance.service.ts`)).toMatch(
      /import .*Decimal.* from '(@cos\/financial|decimal\.js)'/,
    );
  });

  it.each(sourceFiles.map(([f]) => f))('%s uses no parseFloat', (file) => {
    // parseFloat has no legitimate use here at all: it is lossy on money and lenient on garbage,
    // returning a number for "12abc" rather than refusing it.
    const body = sourceFiles.find(([f]) => f === file)![1];
    expect(body).not.toContain('parseFloat(');
  });

  it.each(sourceFiles.map(([f]) => f))(
    '%s coerces with Number() only for non-money values',
    (file) => {
      const body = codeOnly(sourceFiles.find(([f]) => f === file)![1]);
      // `(?<![A-Za-z])` so the class-validator decorator `@IsNumber()` is not read as a coercion.
      const suspects = [...body.matchAll(/(?<![A-Za-z])Number\(([^)]*)\)/g)]
        .map((m) => m[1]!.trim())
        // `x ?? 0` is a default for a missing value, not part of the identifier being coerced.
        .map((arg) => arg.split('??')[0]!.trim())
        .filter((arg) => {
          // Strip a property access down to its last segment: `countRows[0]?.count` -> `count`.
          const tail =
            arg
              .split(/[.?[\]]/)
              .filter(Boolean)
              .pop() ?? arg;
          return !NON_MONETARY.test(tail);
        });
      expect(suspects).toEqual([]);
    },
  );

  it('arithmetic operators are not applied to amount-like identifiers', () => {
    // `a.amount * b` or `total_amount + x` in JavaScript is float arithmetic on money whatever the
    // column type is.
    for (const [file, body] of sourceFiles) {
      const hits = [
        ...codeOnly(body).matchAll(/(\w*(?:amount|price|cost|total|rate)\w*)\s*[*/+-]\s*\w/gi),
      ]
        .map((m) => m[0])
        // SQL inside a template literal is Postgres arithmetic, which is exact on numeric.
        .filter((s) => !/^\s*(SUM|COALESCE)/i.test(s));
      expect({ file, hits }).toEqual({ file, hits: [] });
    }
  });
});

describe('Phase 7 · tax rates are never hardcoded (master:3001)', () => {
  const wht = read(`${financeDir}/wht.service.ts`);

  it('the WHT service reads its rate from wht_rules', () => {
    // "Do NOT hardcode tax rates — use wht_rules table for all jurisdictions". Thailand's 3%/5% are
    // stated in the spec as the DEFAULT ROWS to seed, not as constants to compile in: a rate that
    // lives in code cannot be changed by the TENANT_ADMIN the spec puts in charge of it.
    expect(wht).toMatch(/findWhtRule|wht_rules/);
  });

  it('no numeric rate literal is used in the calculation', () => {
    const calculation = wht.slice(wht.indexOf('async calculate('));
    expect(calculation).not.toMatch(/[^\w.](0\.03|0\.05|\b3\b\s*\/\s*100|\b5\b\s*\/\s*100)/);
  });

  it('refuses to guess when no rule exists for the jurisdiction', () => {
    // The alternative — falling back to a built-in rate — is how a Thai 3% quietly gets withheld on
    // a Singapore invoice.
    expect(wht).toMatch(/NotFoundException|throw/);
  });

  it('tax calculation is delegated to Avalara AvaTax (master:2997)', () => {
    const avatax = read(`${financeDir}/ep/avatax.stub.ts`);
    expect(avatax).toMatch(/avatax|avalara/i);
  });
});
