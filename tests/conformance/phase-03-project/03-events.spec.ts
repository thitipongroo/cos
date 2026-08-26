/**
 * Phase 3 Generate item 10 — master:2192-2197, with the envelope + payload rules from the
 * CROSS-SERVICE EVENT CONTRACT SPEC (master:699-941).
 *
 *   project.created        (envelope + project.created payload)
 *   project.updated        (envelope + changed fields as patch payload)
 *   project.status_changed (envelope + { project_id, from_status, to_status, reason })
 *   project.archived       (envelope + { project_id })
 *
 * master:723 — "Legacy names shown first → canonical name in brackets. New events use canonical
 * name only", and master:727 fixes the canonical name for the create event.
 * master:939 — "Agents must generate both TypeScript interface AND Avro schema for each event".
 */
import * as fs from 'fs';
import * as path from 'path';
import { repoRoot } from '../helpers';

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
const avro = files.filter((f) => f.endsWith('.avsc'));
const tsCorpus = files
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
  .map((f) => fs.readFileSync(f, 'utf8'))
  .join('\n');

describe('Phase 3 · the create event uses the canonical name (master:723, 727)', () => {
  it('construction.project.created.v1 appears in a typed contract', () => {
    expect(tsCorpus).toContain('construction.project.created.v1');
  });

  it('it has an Avro schema (master:939)', () => {
    const found = avro.some(
      (f) =>
        path.basename(f).startsWith('construction.project.created.v1') ||
        (JSON.parse(fs.readFileSync(f, 'utf8')) as { name?: string; namespace?: string }).name ===
          'created',
    );
    expect(found).toBe(true);
  });
});

describe('Phase 3 · the other three project events exist (master:2195-2197)', () => {
  it.each([
    ['updated', /project\.updated/],
    ['status_changed', /project\.status_changed/],
    ['archived', /project\.archived/],
  ])('a contract exists for project.%s', (_label, pattern) => {
    expect(tsCorpus).toMatch(pattern);
  });
});

describe('Phase 3 · status_changed payload shape (master:2196)', () => {
  /** The spec fixes these four fields by name. */
  const statusChangedSource = files
    .filter((f) => /status.?changed/i.test(path.basename(f)))
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');

  it('a status_changed contract file exists', () => {
    expect(statusChangedSource.length).toBeGreaterThan(0);
  });

  it.each(['project_id', 'from_status', 'to_status', 'reason'])('carries %s', (field) => {
    expect(statusChangedSource).toContain(field);
  });
});

describe('Phase 3 · envelope discipline (master:700-720)', () => {
  it('no Avro subject uses the TopicNameStrategy "-value" suffix (master:937)', () => {
    expect(avro.filter((f) => path.basename(f).includes('-value'))).toEqual([]);
  });
});
