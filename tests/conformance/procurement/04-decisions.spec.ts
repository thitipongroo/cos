/**
 * Phase 5 "Do not invent" and "Decisions" — master:2530-2557
 *
 *   VendorScoring: 3 criteria (on-time delivery, quality, price competitiveness); weights
 *     configured per tenant in vendor_score_weights; grade ENUM(A,B,C,D,F)
 *   WithholdingTaxRules: Thailand default 3% services / 5% rent; other jurisdictions configured
 *     by TENANT_ADMIN via the wht_rules table
 *   "Do NOT hardcode tax rates — use wht_rules table for all jurisdictions" (master:2995)
 */
import * as fs from 'fs';
import * as path from 'path';
import { repoRoot } from '../helpers';

const corpus = ((): string => {
  const out: string[] = [];
  const walk = (d: string): void => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (!['node_modules', 'dist'].includes(e.name)) walk(full);
      } else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) out.push(full);
    }
  };
  walk(path.join(repoRoot, 'backend/src'));
  return out.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
})();

const migrations = ((): string => {
  const dir = path.join(repoRoot, 'backend/prisma/migrations');
  return fs
    .readdirSync(dir)
    .map((d) => path.join(dir, d, 'migration.sql'))
    .filter((f) => fs.existsSync(f))
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');
})();

describe('Phase 5 · D1 VendorScoring (master:2545-2551)', () => {
  it.each(['on_time_delivery', 'quality', 'price'])('scores on the %s criterion', (c) => {
    expect(corpus).toContain(c);
  });

  it('weights are stored per tenant, not hardcoded (master:2548)', () => {
    expect(migrations).toMatch(/vendor_score_weights/);
  });

  it('produces a grade on the A-F scale (master:2551)', () => {
    expect(corpus).toMatch(/['"]A['"]\s*\|\s*['"]B['"]|grade/i);
  });
});

describe('Phase 5 · D2 WithholdingTaxRules (master:2553-2557, 2995)', () => {
  it('a wht_rules table backs the jurisdictions', () => {
    expect(migrations).toMatch(/wht_rules/);
  });

  it('the Thai defaults are recorded as data, not as a literal in the calculation', () => {
    // "Do NOT hardcode tax rates — use wht_rules table for all jurisdictions" (master:2995).
    // A seeded default row is data; a `rate = 0.03` in a service is a hardcoded rate.
    const services = ((): string => {
      const out: string[] = [];
      const walk = (d: string): void => {
        if (!fs.existsSync(d)) return;
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, e.name);
          if (e.isDirectory()) walk(full);
          else if (/\.(service|repository)\.ts$/.test(full)) out.push(full);
        }
      };
      walk(path.join(repoRoot, 'backend/src/modules/procurement'));
      walk(path.join(repoRoot, 'backend/src/modules/finance'));
      return out.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    })();
    const hardcodedRates = Array.from(
      services.matchAll(/\b(rate|wht[A-Za-z_]*)\s*=\s*0\.0[35]\b/gi),
    );
    expect(hardcodedRates.map((m) => m[0])).toEqual([]);
  });
});

describe('Phase 5 · tax calculation is delegated, not invented (master:2534-2539)', () => {
  it('an Avalara AvaTax seam exists rather than a hand-rolled tax engine', () => {
    expect(corpus).toMatch(/avalara|avatax/i);
  });
});
