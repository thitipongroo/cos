/**
 * Phase 5 Generate items 06, 07, 13, 15 — master:2456-2461, 2467-2468, 2521-2528
 * plus the WORKFLOW ENGINE SPEC rules at master:1534-1541.
 *
 *   "Temporal workflow functions must be deterministic"
 *   "Compensation logic (rollback) must be implemented for CANCELLED transitions"
 *   "All state transitions must emit Kafka events"
 *
 * Determinism is asserted as "no I/O inside the workflow" — the workflow's own header states the
 * rule that way ("no I/O; all I/O in activities"). Date.now()/Math.random() are NOT checked: the
 * Temporal SDK replaces both with deterministic implementations inside the sandbox, so their
 * presence would not be a violation.
 */
import * as fs from 'fs';
import * as path from 'path';
import { repoRoot } from '../helpers';

const WF_DIR = 'backend/src/modules/procurement/workflows';
const wfPath = path.join(repoRoot, WF_DIR);
const wfFiles = fs.existsSync(wfPath) ? fs.readdirSync(wfPath) : [];
const workflows = wfFiles.filter((f) => f.endsWith('.workflow.ts'));
const readWf = (f: string): string => fs.readFileSync(path.join(wfPath, f), 'utf8');

describe('Phase 5 · Temporal workflow definitions (master:2467)', () => {
  it.each(['rfq.workflow.ts', 'po.workflow.ts'])('%s exists', (f) => {
    expect(workflows).toContain(f);
  });

  it.each(['rfq.workflow.ts', 'po.workflow.ts'])('%s runs its side effects as activities', (f) => {
    expect(readWf(f)).toMatch(/proxyActivities/);
  });
});

describe('Phase 5 · workflows do no I/O of their own (master:1538, 2457)', () => {
  /** A workflow that reaches a database, an HTTP client or the filesystem is not replayable. */
  const FORBIDDEN: ReadonlyArray<[string, RegExp]> = [
    ['prisma', /from ['"].*prisma.*['"]/i],
    ['pg', /from ['"]pg['"]/],
    ['axios', /from ['"]axios['"]/],
    ['node:fs / fs', /from ['"](node:)?fs['"]/],
    ['kafkajs', /from ['"]kafkajs['"]/],
    ['redis / ioredis', /from ['"](ioredis|redis)['"]/],
  ];

  it.each(workflows.length ? workflows : ['<none>'])('%s imports nothing that does I/O', (f) => {
    if (f === '<none>') return;
    const body = readWf(f);
    const hits = FORBIDDEN.filter(([, re]) => re.test(body)).map(([name]) => name);
    expect(hits).toEqual([]);
  });

  it('activity imports are type-only, so no activity code is bundled into the workflow', () => {
    for (const f of workflows) {
      const body = readWf(f);
      const activityImports = Array.from(
        body.matchAll(/^import (type )?\{[^}]*\} from '\.\/[^']*activities';$/gm),
      );
      for (const m of activityImports) {
        expect(m[1]).toBe('type ');
      }
    }
  });
});

describe('Phase 5 · Temporal worker registration (master:2468, 2460)', () => {
  it('a worker exists in the procurement module', () => {
    expect(wfFiles.some((f) => /worker\.ts$/.test(f))).toBe(true);
  });

  it('it points at this workflow directory and names a task queue', () => {
    const worker = wfFiles.find((f) => /worker\.ts$/.test(f)) as string;
    const body = readWf(worker);
    expect(body).toMatch(/workflowsPath/);
    expect(body).toMatch(/taskQueue/);
  });
});

describe('Phase 5 · compensation on CANCELLED (master:1539, 2461)', () => {
  it('a compensation activity exists for the PO cancel path', () => {
    const activities = wfFiles
      .filter((f) => f.endsWith('.activities.ts'))
      .map(readWf)
      .join('\n');
    expect(activities).toMatch(/compensate/i);
  });

  it('the PO workflow invokes it', () => {
    expect(readWf('po.workflow.ts')).toMatch(/compensate/i);
  });
});

describe('Phase 5 · Kafka event contracts (master:2521-2528, 939)', () => {
  const collect = (rel: string): string[] => {
    const dir = path.join(repoRoot, rel);
    if (!fs.existsSync(dir)) return [];
    const out: string[] = [];
    const walk = (d: string): void => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) {
          if (!['node_modules', 'dist', 'coverage'].includes(e.name)) walk(full);
        } else out.push(full);
      }
    };
    walk(dir);
    return out;
  };
  const files = [...collect('packages'), ...collect('backend/src')];
  const tsCorpus = files
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');

  it.each([
    'procurement.rfq.created',
    'procurement.rfq.status_changed',
    'procurement.po.created',
    'procurement.po.status_changed',
    'procurement.delivery.received',
    'procurement.invoice.received',
  ])('a contract exists for %s', (evt) => {
    expect(tsCorpus).toContain(evt);
  });

  it.each([
    ['rfq.status_changed', ['rfq_id', 'from_status', 'to_status']],
    ['po.status_changed', ['po_id', 'from_status', 'to_status']],
  ])('%s carries the fields the spec names', (evt, fields) => {
    const matching = files.filter((f) =>
      new RegExp(evt.replace('.', '.*'), 'i').test(path.basename(f)),
    );
    expect(matching.length).toBeGreaterThan(0);
    const body = matching.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    for (const field of fields) expect(body).toContain(field);
  });
});
