/**
 * Phase 7 Constraints — master:2851-2857 (scope) and 2993-3010.
 *
 * These are NEGATIVE requirements, and they are the easiest kind of requirement to satisfy by
 * accident and the hardest to notice being broken. A general ledger does not appear in one commit;
 * it appears as a `journal_entries` table someone adds because an invoice needed a counterpart.
 */
import * as fs from 'fs';
import * as path from 'path';
import { repoRoot } from '../helpers';

const financeDir = 'backend/src/modules/finance';

const sources = ((): Array<[string, string]> => {
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

const allSrc = sources.map(([, b]) => b).join('\n');

describe('Phase 7 · this is cost tracking, not accounting (master:2851-2856, 2995-2996)', () => {
  it.each([
    ['double-entry bookkeeping', /journal_entr|double.entry|\bdebit\b|\bcredit_account\b/i],
    ['a chart of accounts', /chart_of_accounts|chart of accounts|\bgl_account|account_code/i],
    ['GL posting', /\bpost_to_gl\b|general_ledger|gl_posting/i],
  ])('implements no %s', (_label, pattern) => {
    // master:2857 marks all three UNSPECIFIED and says to escalate rather than generate stubs — so
    // finding a half-built one here would be worse than finding none: it would be a decision taken
    // without the product owner.
    const offenders = sources.filter(([, body]) => pattern.test(body)).map(([f]) => f);
    expect(offenders).toEqual([]);
  });
});

describe('Phase 7 · cross-service data arrives only via Kafka (master:3010)', () => {
  it('no SQL in the finance module reads a procurement table', () => {
    // "no direct DB queries to Procurement". The module boundary is the point: Finance approves and
    // pays vendor invoices that Procurement owns, and reaching into its tables would make the two
    // deployable only together. ADR-024 §2 restates it for the cash-flow outflow specifically.
    const offenders: string[] = [];
    for (const [file, body] of sources) {
      // Match a schema-qualified table reference, not the event topic names, which legitimately
      // begin "procurement." and are strings in the consumer.
      const hits = [...body.matchAll(/\bprocurement\.[a-z_]+/g)]
        .map((m) => m[0])
        .filter((ref) => !/\.(po|invoice|rfq|vendor|delivery)\.[a-z_]+$/.test(ref))
        .filter((ref) => !/\.(created|received|status_changed|approved)$/.test(ref))
        .filter((ref) => {
          // Keep only references that look like a table in a query, i.e. preceded by FROM/JOIN/INTO.
          const i = body.indexOf(ref);
          const before = body.slice(Math.max(0, i - 30), i).toUpperCase();
          return /\b(FROM|JOIN|INTO|UPDATE)\s*$/.test(before);
        });
      if (hits.length) offenders.push(`${file}: ${hits.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe('Phase 7 · retention is entered, never derived (master:2931-2935)', () => {
  it('no system default retention percentage is compiled in', () => {
    // "retention_percentage is entered by TENANT_ADMIN per PO in UI; no automatic calculation."
    // A default of 5 or 10 here would silently withhold money from a subcontractor under a contract
    // that never agreed to it.
    expect(allSrc).not.toMatch(/retention_percentage\s*[:=]\s*(?!null)[0-9]/i);
    expect(allSrc).not.toMatch(/DEFAULT_RETENTION/i);
  });
});
