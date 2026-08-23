/**
 * Repo-wide architecture invariants — §35.13 ESC-27.
 *
 * Several §35.10 cases are not "does this function work" but "does the codebase still hold this
 * rule", and they had sat as PLANNED with the note "no automated assertion". A rule nobody checks
 * is a rule that drifts, so each one below is now enforced by scanning the source tree.
 *
 * Covers:
 *   TC-P07-UNIT-017  Finance holds no double-entry / chart-of-accounts / GL logic
 *   TC-P10-UNIT-018  React Native never uses IndexedDB; the web app never uses expo-sqlite
 *   TC-P11-UNIT-001  No caller invokes an LLM SDK directly — everything goes through ai-gateway
 *   TC-P12-UNIT-018  AI output triggers no autonomous action in other services
 *   TC-P15-UNIT-007  `console.log` is not used in application code
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../..');

/**
 * Lists tracked files matching the given pathspecs. `git ls-files` is used rather than a directory
 * walk so build output, node_modules and anything gitignored can never leak into a scan.
 */
function trackedFiles(...pathspecs: string[]): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--', ...pathspecs], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return out.split('\0').filter(Boolean);
}

/** Returns `{file, line, text}` for every tracked line matching `pattern`. */
function grepTracked(
  pattern: RegExp,
  pathspecs: string[],
  exclude: (file: string) => boolean = () => false,
): Array<{ file: string; line: number; text: string }> {
  const hits: Array<{ file: string; line: number; text: string }> = [];
  for (const file of trackedFiles(...pathspecs)) {
    if (exclude(file)) continue;
    const abs = path.join(REPO_ROOT, file);
    let content: string;
    try {
      content = fs.readFileSync(abs, 'utf8');
    } catch {
      continue; // deleted between ls-files and read
    }
    content.split(/\r?\n/).forEach((text, i) => {
      if (pattern.test(text)) hits.push({ file, line: i + 1, text: text.trim() });
    });
    pattern.lastIndex = 0;
  }
  return hits;
}

const report = (hits: Array<{ file: string; line: number; text: string }>) =>
  hits.map((h) => `${h.file}:${h.line}  ${h.text}`).join('\n');

const isTest = (f: string) =>
  /(^|\/)(__tests__|__mocks__|tests?)\//.test(f) || /\.(spec|test)\.[tj]sx?$/.test(f);

// ─── TC-P15-UNIT-007 ─────────────────────────────────────────────────────────

describe('TC-P15-UNIT-007 — application code uses the structured logger, never console.log', () => {
  it('has no console.log in backend or service source', () => {
    const hits = grepTracked(
      /(^|[^.\w])console\.log\s*\(/,
      [
        'backend/src/**/*.ts',
        'services/*/src/**/*.ts',
        'packages/@cos/*/src/**/*.ts',
        'apps/web/src/**/*.ts',
        'apps/web/src/**/*.tsx',
      ],
      isTest,
    );
    expect(report(hits)).toBe('');
  });
});

// ─── TC-P10-UNIT-018 ─────────────────────────────────────────────────────────

describe('TC-P10-UNIT-018 — the two clients use their own storage engines', () => {
  it('React Native never reaches for IndexedDB', () => {
    // apps/mobile persists through WatermelonDB/expo-sqlite; IndexedDB does not exist there.
    const hits = grepTracked(
      /\bindexedDB\b|\bIDBDatabase\b|from ['"]idb['"]/,
      ['apps/mobile/src/**/*.ts', 'apps/mobile/src/**/*.tsx'],
      isTest,
    );
    expect(report(hits)).toBe('');
  });

  it('the web app never reaches for expo-sqlite', () => {
    const hits = grepTracked(
      /expo-sqlite|@nozbe\/watermelondb/,
      ['apps/web/src/**/*.ts', 'apps/web/src/**/*.tsx'],
      isTest,
    );
    expect(report(hits)).toBe('');
  });
});

// ─── TC-P11-UNIT-001 ─────────────────────────────────────────────────────────

describe('TC-P11-UNIT-001 — LLM access goes through ai-gateway only', () => {
  it('no service outside ai-gateway imports an LLM SDK', () => {
    const hits = grepTracked(
      /(from|import)\s+['"](openai|@anthropic-ai\/[\w-]+|@google\/generative-ai|cohere-ai)['"]|^\s*import\s+(openai|anthropic)\b/,
      [
        'backend/src/**/*.ts',
        'services/*/src/**/*.ts',
        'services/*/**/*.py',
        'packages/@cos/*/src/**/*.ts',
        'apps/web/src/**/*.ts',
        'apps/web/src/**/*.tsx',
        'apps/mobile/src/**/*.ts',
        'apps/mobile/src/**/*.tsx',
      ],
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
      ['backend/src/modules/finance/**/*.ts'],
      isTest,
    );
    expect(report(hits)).toBe('');
  });

  it('has no ledger tables in the finance schema', () => {
    const hits = grepTracked(
      /CREATE TABLE[^;]*\b(journal_entries|ledger_entries|chart_of_accounts|gl_accounts)\b/i,
      ['backend/prisma/migrations/**/*.sql'],
    );
    expect(report(hits)).toBe('');
  });
});

// ─── TC-P12-UNIT-018 ─────────────────────────────────────────────────────────

describe('TC-P12-UNIT-018 — AI output never triggers an autonomous action', () => {
  it('the report pipeline only persists and returns; it calls no other service', () => {
    // Layer A is assistive (spec 21 §21.4): a generated report is shown to a human, never acted on.
    // The pipeline may write its own row and hand the result back — nothing else.
    const hits = grepTracked(
      /\b(httpx|requests|aiohttp)\.(get|post|put|patch|delete)\b|AIOKafkaProducer|send_and_wait/,
      ['services/ai-gateway/reports/**/*.py'],
      isTest,
    );
    expect(report(hits)).toBe('');
  });

  it('no consumer acts on an ai.* event', () => {
    // If a backend consumer ever subscribes to an ai.* topic, this rule needs a product decision
    // rather than a silent change.
    const hits = grepTracked(/subscribe[^\n]*['"]ai\./, ['backend/src/**/*.ts'], isTest);
    expect(report(hits)).toBe('');
  });
});

// ─── the scanner itself ──────────────────────────────────────────────────────

describe('scan helpers', () => {
  it('git ls-files returns tracked source, excluding build output', () => {
    const files = trackedFiles('backend/src/**/*.ts');
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => f.startsWith('backend/src/'))).toBe(true);
    expect(files.some((f) => f.includes('node_modules') || f.includes('/dist/'))).toBe(false);
  });

  it('grepTracked finds a pattern that certainly exists', () => {
    const hits = grepTracked(/OutboxPublisher/, ['backend/src/**/*.ts']);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('isTest recognises the repo conventions', () => {
    expect(isTest('backend/src/modules/boq/__tests__/boq.service.spec.ts')).toBe(true);
    expect(isTest('tests/contract/foo.spec.ts')).toBe(true);
    expect(isTest('apps/mobile/src/__mocks__/react-native.ts')).toBe(true);
    expect(isTest('backend/src/modules/boq/boq.service.ts')).toBe(false);
  });
});
