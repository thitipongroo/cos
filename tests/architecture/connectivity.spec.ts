/**
 * Cross-service coupling and connection-topology invariants — §35.13 ESC-28.
 *
 * Two more §35.10 cases that are properties of the repository rather than of any running code:
 *
 *   TC-P07-INT-002              Finance never queries procurement tables directly
 *   TC-P01-INT-001 / TC-P17-INT-001  The application connects through PgBouncer, never to 5432
 *
 * Both were `PLANNED — not located`. Neither needs a database: the first is answered by what SQL
 * the finance module contains, the second by what the committed connection strings say. Checking
 * them here means a regression fails a PR instead of being found in production.
 */

import * as fs from 'fs';
import * as path from 'path';

import { REPO_ROOT, TS, grepTracked, isTest, report } from './scan';

// ─── TC-P07-INT-002 ──────────────────────────────────────────────────────────

describe('TC-P07-INT-002 — finance reads procurement through events, not tables', () => {
  it('issues no SQL against a procurement.* table', () => {
    // Finance learns about POs and invoices from procurement.* EVENTS (finance.consumer.ts). A
    // direct cross-schema query would couple the two services and bypass the event contract that
    // the outbox now guarantees.
    const hits = grepTracked(
      /(FROM|JOIN|INTO|UPDATE)\s+procurement\./i,
      ['backend/src/modules/finance/'],
      TS,
      isTest,
    );
    expect(report(hits)).toBe('');
  });

  it('still consumes the procurement events it depends on', () => {
    // The inverse mistake: severing the coupling entirely would leave finance blind to committed
    // cost. This asserts the event contract is actually wired, not merely that no SQL exists.
    const hits = grepTracked(
      /procurement\.po\.created\.v1/,
      ['backend/src/modules/finance/'],
      TS,
      isTest,
    );
    expect(hits.length).toBeGreaterThan(0);
  });
});

// ─── TC-P01-INT-001 / TC-P17-INT-001 ─────────────────────────────────────────

describe('TC-P01-INT-001 / TC-P17-INT-001 — the app connects through PgBouncer (QM-18)', () => {
  const RUNTIME_URL = /^\s*(DATABASE_URL|APP_DATABASE_URL)\s*[:=]\s*(postgres(?:ql)?:\/\/\S+)/;
  const VIA_POOLER = /@pgbouncer:|:6432\//;

  function runtimeUrlLines(file: string): Array<{ line: number; text: string; url: string }> {
    const content = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
    const found: Array<{ line: number; text: string; url: string }> = [];
    content.split(/\r?\n/).forEach((text, i) => {
      const m = text.match(RUNTIME_URL);
      if (m) found.push({ line: i + 1, text: text.trim(), url: m[2]! });
    });
    return found;
  }

  it.each(['.env.example', 'docker-compose.yml'])(
    'every runtime connection string in %s goes through the pooler',
    (file) => {
      const offenders = runtimeUrlLines(file)
        .filter((l) => !VIA_POOLER.test(l.url))
        .map((l) => file + ':' + l.line + '  ' + l.text);
      expect(offenders.join('\n')).toBe('');
    },
  );

  it('finds runtime URLs to check in the first place', () => {
    // Guards against the regex silently matching nothing after a rename, which would make the
    // assertions above vacuously pass.
    expect(runtimeUrlLines('.env.example').length).toBeGreaterThan(0);
    expect(runtimeUrlLines('docker-compose.yml').length).toBeGreaterThan(0);
  });

  it('DIRECT_DATABASE_URL exists and deliberately bypasses the pooler', () => {
    // The documented exception: Prisma migrations cannot run through a transaction-mode pooler,
    // so this one URL must name PostgreSQL directly. Asserting it keeps the exception explicit
    // rather than letting a future edit quietly route migrations through PgBouncer.
    const env = fs.readFileSync(path.join(REPO_ROOT, '.env.example'), 'utf8');
    const line = env.split(/\r?\n/).find((l) => /^\s*DIRECT_DATABASE_URL\s*=/.test(l));
    expect(line).toBeDefined();
    expect(VIA_POOLER.test(line as string)).toBe(false);
  });
});
