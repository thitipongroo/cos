/**
 * Repo-wide architecture invariants — §35.13 ESC-27.
 *
 * Several §35.10 cases are not "does this function work" but "does the codebase still hold this
 * rule", and they had sat as PLANNED with the note "no automated assertion". A rule nobody checks
 * is a rule that drifts, so each one below is now enforced by scanning the tracked source tree.
 *
 * Covers:
 *   TC-P07-UNIT-017  Finance holds no double-entry / chart-of-accounts / GL logic
 *   TC-P10-UNIT-018  React Native never uses IndexedDB; the web app never uses expo-sqlite
 *   TC-P11-UNIT-001  No caller invokes an LLM SDK directly — everything goes through ai-gateway
 *   TC-P12-UNIT-018  AI output triggers no autonomous action in other services
 *   TC-P15-UNIT-007  `console.log` is not used in application code
 */

import { PY, SQL, TS, grepTracked, isTest, report, trackedFiles } from './scan';

const APP_SOURCE = [
  'backend/src/',
  'services/',
  'packages/@cos/',
  'apps/web/src/',
  'apps/mobile/src/',
];

// ─── TC-P15-UNIT-007 ─────────────────────────────────────────────────────────

describe('TC-P15-UNIT-007 — application code uses the structured logger, never console.log', () => {
  it('has no console.log in any workspace source', () => {
    // `*.script.ts` is exempt, and only that. These are operator CLIs run by hand — the
    // reconcile-contracts one prints a dry-run deletion plan and waits for a human to re-run it with
    // --apply. Its stdout IS the output contract, so a structured logger would render the plan as
    // JSON log lines and defeat the purpose of showing it. They sit under backend/src/ rather than
    // in a scripts/ directory on purpose: each imports the predicate from the module its unit tests
    // cover, and a copy outside the tree would be a second definition that eventually disagrees.
    //
    // The rule still reads "application code", which is what this narrows the scan to. Anything that
    // runs as part of a service is not a *.script.ts and is still caught.
    const isScript = (f: string): boolean => f.endsWith('.script.ts');
    const hits = grepTracked(
      /(^|[^.\w])console\.log\s*\(/,
      APP_SOURCE,
      TS,
      (f) => isTest(f) || isScript(f),
    );
    expect(report(hits)).toBe('');
  });

  it('the exemption covers scripts ONLY — a service file with console.log is still caught', () => {
    // Guards the guard: an exemption written as a broader pattern would silently switch this scan
    // off. Asserting the scan still reaches ordinary source is what keeps it honest.
    const scanned = trackedFiles(APP_SOURCE, TS).filter((f) => !isTest(f));
    expect(scanned).toContain('backend/src/main.ts');
    expect(scanned.some((f) => f.endsWith('.script.ts'))).toBe(true);
  });
});

// ─── TC-P10-UNIT-018 ─────────────────────────────────────────────────────────

describe('TC-P10-UNIT-018 — the two clients use their own storage engines', () => {
  it('React Native never reaches for IndexedDB', () => {
    // apps/mobile persists through WatermelonDB/expo-sqlite; IndexedDB does not exist there.
    const hits = grepTracked(
      /\bindexedDB\b|\bIDBDatabase\b|from ['"]idb['"]/,
      ['apps/mobile/src/'],
      TS,
      isTest,
    );
    expect(report(hits)).toBe('');
  });

  it('the web app never reaches for expo-sqlite', () => {
    const hits = grepTracked(/expo-sqlite|@nozbe\/watermelondb/, ['apps/web/src/'], TS, isTest);
    expect(report(hits)).toBe('');
  });
});

// ─── TC-P11-UNIT-001 ─────────────────────────────────────────────────────────

describe('TC-P11-UNIT-001 — LLM access goes through ai-gateway only', () => {
  it('no workspace outside ai-gateway imports an LLM SDK', () => {
    const hits = grepTracked(
      /(from|import)\s+['"](openai|@anthropic-ai\/[\w-]+|@google\/generative-ai|cohere-ai)['"]|^\s*import\s+(openai|anthropic)\b/,
      APP_SOURCE,
      [...TS, ...PY],
      (f) => isTest(f) || f.startsWith('services/ai-gateway/'),
    );
    expect(report(hits)).toBe('');
  });
});

// ─── TC-P07-UNIT-017 ─────────────────────────────────────────────────────────

describe('TC-P07-UNIT-017 — finance is cost tracking, not an accounting ledger', () => {
  it('holds no double-entry, chart-of-accounts or general-ledger logic', () => {
    // Scope note (spec §7): COS tracks project cost and cash flow. Bookkeeping stays in the
    // customer's ERP — anything resembling a GL here is scope creep, not a feature.
    const hits = grepTracked(
      /\b(double[- ]entry|chart[- ]of[- ]accounts|general[- ]ledger|journal[- ]entr|debit_credit|trial[- ]balance)\b/i,
      ['backend/src/modules/finance/'],
      TS,
      isTest,
    );
    expect(report(hits)).toBe('');
  });

  it('has no ledger tables in any migration', () => {
    const hits = grepTracked(
      /CREATE TABLE[^;]*\b(journal_entries|ledger_entries|chart_of_accounts|gl_accounts)\b/i,
      ['backend/prisma/migrations/'],
      SQL,
    );
    expect(report(hits)).toBe('');
  });
});

// ─── TC-P12-UNIT-018 ─────────────────────────────────────────────────────────

describe('TC-P12-UNIT-018 — AI output never triggers an autonomous action', () => {
  it('the report pipeline only persists and returns; it calls no other service', () => {
    // Layer A is assistive (spec 21 §21.4): a generated report is shown to a human, never acted on.
    //
    // Scoped to the PIPELINE, not to everything sharing its directory. reports/ also holds three
    // spec-mandated event emitters — safety_violation_event (§19.6 names it an event that cannot be
    // disabled), risk_event and delay_event — which the pipeline neither imports nor runs. The scan
    // used to flag their `send_and_wait` as if the pipeline had made the call.
    //
    // §35.13 ESC-47 is OPEN on ONE of them: delay_event's `construction.delay.detected.v1` is
    // consumed by tasks.delay.consumer.ts, which moves a task to BLOCKED with nobody in the loop —
    // §21.4 and Phase 6 gate 6 disagree about whether that is allowed, and that is a product-owner
    // question, not one to settle by loosening or tightening a regex. Re-tighten this scan once it
    // is answered.
    const isEventEmitter = (f: string): boolean => f.endsWith('_event.py');
    const hits = grepTracked(
      /\b(httpx|requests|aiohttp)\.(get|post|put|patch|delete)\b|AIOKafkaProducer|send_and_wait/,
      ['services/ai-gateway/reports/'],
      PY,
      (f) => isTest(f) || isEventEmitter(f),
    );
    expect(report(hits)).toBe('');
  });

  it('the pipeline does not import an event emitter, so it cannot publish one indirectly', () => {
    // The assertion the directory scan was really reaching for, stated against the dependency rather
    // than against file proximity: exempting *_event.py is only safe while nothing in the pipeline's
    // own import graph pulls one in. This is what makes that exemption a narrowing and not a hole.
    const hits = grepTracked(
      /^\s*(from|import)\s+[\w.]*\b\w+_event\b/,
      ['services/ai-gateway/reports/'],
      PY,
      (f) => isTest(f) || f.endsWith('_event.py'),
    );
    expect(report(hits)).toBe('');
  });

  it('no backend consumer subscribes to an ai.* topic', () => {
    const hits = grepTracked(/subscribe[^\n]*['"]ai\./, ['backend/src/'], TS, isTest);
    expect(report(hits)).toBe('');
  });
});

// ─── the scanner itself ──────────────────────────────────────────────────────
//
// These guard the guards. A scan whose pathspec matches nothing reports "no violations" just as
// loudly as one that genuinely found none, so the reach of each scan is asserted explicitly.

describe('scan helpers', () => {
  it('reaches files at the TOP level of a scanned directory, not only in subdirectories', () => {
    // The first version of this suite used a `dir/**/*.ts` pathspec, which git matches only inside
    // a SUBdirectory — `backend/src/main.ts` and every module-root file were silently skipped, and
    // the finance scan covered nothing at all. Caught by a coverage guard, not by review.
    const files = trackedFiles(['backend/src/'], TS);
    expect(files).toContain('backend/src/main.ts');
    expect(files).toContain('backend/src/app.module.ts');
    expect(files).toContain('backend/src/modules/finance/finance.consumer.ts');
  });

  it('excludes build output and untracked paths', () => {
    const files = trackedFiles(['backend/src/'], TS);
    expect(files.every((f) => f.startsWith('backend/src/'))).toBe(true);
    expect(files.some((f) => f.includes('node_modules') || f.includes('/dist/'))).toBe(false);
  });

  it('filters to the requested extensions', () => {
    const files = trackedFiles(['backend/src/'], TS);
    expect(files.every((f) => f.endsWith('.ts') || f.endsWith('.tsx'))).toBe(true);
  });

  it('finds a pattern that certainly exists', () => {
    const hits = grepTracked(/OutboxPublisher/, ['backend/src/'], TS);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('scans every workspace the invariants claim to cover', () => {
    for (const dir of APP_SOURCE) {
      expect(trackedFiles([dir], [...TS, ...PY]).length).toBeGreaterThan(0);
    }
  });

  it('isTest recognises the repo conventions', () => {
    expect(isTest('backend/src/modules/boq/__tests__/boq.service.spec.ts')).toBe(true);
    expect(isTest('tests/contract/foo.spec.ts')).toBe(true);
    expect(isTest('apps/mobile/src/__mocks__/react-native.ts')).toBe(true);
    expect(isTest('backend/src/modules/boq/boq.service.ts')).toBe(false);
  });
});
