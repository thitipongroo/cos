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

// The one file master grants an exception (§ PHASE 7 line 3216, decided 2026-08-23, TDD OQ-31).
// A ledger built from a stream cannot detect its own gaps: the outbox is durable, not transactional
// (ADR-094), so a dropped procurement.po.created.v1 leaves the budget silently under-committed and
// nothing in the system disagrees with anything else. The sweep compares finance.cost_transactions
// against the source tables hourly and reports drift. Exempted here, and held to the exception's
// stated limits by the suite that follows.
const RECONCILIATION_SWEEP = 'ledger-reconciliation.service.ts';

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
      if (file.endsWith(RECONCILIATION_SWEEP)) continue;
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

// ── the five things this service does NOT do (master:2866-2872) ────────────
//
// The scope clarification opens the phase and is unusually emphatic: this is a PROJECT COST
// TRACKING system, and double-entry bookkeeping, a chart of accounts, GL posting and external
// ERP/accounting integration are "UNSPECIFIED — escalate to product owner for decision; do not
// generate stubs."
//
// That last clause is what makes this checkable and worth checking. The normal way a boundary like
// this erodes is not a decision to build an accounting system — it is one `journal_entries` table
// added because an invoice needed a counterpart, then a `posting_date`, then a trial balance. Each
// step is small, each is defensible on its own, and the escalation the spec asks for never happens
// because nobody notices a line has been crossed.
//
// Matched on IDENTIFIERS in code, not on prose: this file and the module's own README describe the
// exclusion, and a scan that read comments would flag the text that records the rule.

describe('finance stays a cost tracker, not an accounting system (master:2866-2872)', () => {
  /** Source with comment lines removed, so the rule's own description cannot match itself. */
  const codeOnly = (body: string): string =>
    body
      .split('\n')
      .filter((l) => {
        const t = l.trimStart();
        return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
      })
      .join('\n');

  it.each([
    ['double-entry bookkeeping', /\b(journal_entr|double_entry|doubleEntry)\w*/i],
    ['a chart of accounts', /\b(chart_of_accounts|chartOfAccounts|account_code|accountCode)\w*/i],
    [
      'general-ledger posting',
      /\b(general_ledger|generalLedger|gl_posting|glPosting|post_to_gl)\w*/i,
    ],
    ['debit/credit pairs', /\b(debit_amount|debitAmount|credit_amount|creditAmount)\b/i],
  ])('implements no %s', (_label, pattern) => {
    const offenders = sources
      .filter(([, body]) => pattern.test(codeOnly(body)))
      .map(([f]) => path.relative(repoRoot, f));
    expect(offenders).toEqual([]);
  });

  it('has no migration adding an accounting table to the finance schema', () => {
    // The other half: the boundary can be crossed in SQL without a line of TypeScript. A migration
    // creating finance.journal_entries would leave every source scan above clean.
    const migrations = path.join(repoRoot, 'backend/prisma/migrations');
    const offenders: string[] = [];
    for (const dir of fs.readdirSync(migrations)) {
      const sql = path.join(migrations, dir, 'migration.sql');
      if (!fs.existsSync(sql)) continue;
      const body = fs.readFileSync(sql, 'utf8');
      if (
        /CREATE TABLE\s+(finance\.)?(journal_entries|chart_of_accounts|general_ledger)/i.test(body)
      ) {
        offenders.push(dir);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('ships ERP adapters as stubs, not as integrations (master:3029, 3040-3046)', () => {
    // The ERP decision is the opposite shape from the four above: three adapters are REQUIRED to
    // exist, and required to stay stubs "until first customer with that ERP onboards". A stub that
    // quietly grew a real SAP client would be the same boundary crossed from the other side.
    const names = ['SAPAdapter', 'OracleAdapter', 'DynamicsAdapter'];
    const declared = sources.filter(([, body]) => names.some((n) => body.includes(n)));
    expect(declared.length).toBeGreaterThan(0);

    const vendorSdk = sources
      .filter(([, body]) =>
        /(?:from\s+['"]|require\(\s*['"])[^'"]*(?:sap-|@sap\/|oracledb|@microsoft\/dynamics)/i.test(
          codeOnly(body),
        ),
      )
      .map(([f]) => path.relative(repoRoot, f));
    expect(vendorSdk).toEqual([]);
  });
});

describe('Phase 7 · the reconciliation exception stays narrow (master:3216-3232; TDD OQ-31)', () => {
  const sweep = sources.find(([file]) => file.endsWith(RECONCILIATION_SWEEP));

  it('the exempted file exists — a rename must not silently widen the exemption', () => {
    // Without this, renaming the service turns the exemption into a filter that matches nothing:
    // the file would then be checked like any other and the suite below would test an empty string.
    expect(sweep).toBeDefined();
  });

  it('reads Procurement, and only reads it', () => {
    // "READ ONLY — identity + amount columns only." An INSERT, UPDATE or DELETE against a
    // procurement table would make Finance a second writer of another service's data.
    const body = sweep![1];
    const writes = [
      ...body.matchAll(/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+procurement\.[a-z_]+/gi),
    ];
    expect(writes.map((m) => m[0])).toEqual([]);
  });

  it('never writes a cost transaction', () => {
    // "Repair is re-publishing the missing event, so FinanceConsumer stays the single writer and
    // the ledger stays replayable." A job that inserted the row directly would be a second writer
    // with no event behind it — and cost_transactions has no unique key on
    // (tenant_id, source_type, source_id), so the first redelivery of the real event would then
    // double-count it.
    const body = sweep![1];
    expect(body).not.toMatch(/INSERT\s+INTO\s+finance\.cost_transactions/i);
    expect(body).not.toMatch(/createTransaction\s*\(/);
  });

  it('is not reachable from a request — its output is a log line and a gauge', () => {
    // "Never feeds a request, an API response, or a business decision." A controller decorator here
    // would turn the exemption into a Procurement read path that answers callers.
    const body = sweep![1];
    expect(body).not.toMatch(/@(Controller|Get|Post|Patch|Put|Delete)\s*\(/);
  });
});
