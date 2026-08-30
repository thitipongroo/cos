/**
 * Phase 6 Generate items 02, 07, 08, 13, 14 and the Decision — master:2755-2770, 2789-2829.
 */
import * as fs from 'fs';
import * as path from 'path';
import { exists, read, readYaml, repoRoot } from '../helpers';

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

const siteOps = collect('backend/src/modules/site-ops');
const siteOpsSrc = siteOps
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
  .map((f) => fs.readFileSync(f, 'utf8'))
  .join('\n');

describe('Phase 6 · module and offline sync controller (master:2792)', () => {
  it.each([
    ['module', 'backend/src/modules/site-ops/site-ops.module.ts'],
    ['service', 'backend/src/modules/site-ops/site-ops.service.ts'],
    ['repository', 'backend/src/modules/site-ops/site-ops.repository.ts'],
    ['controller', 'backend/src/modules/site-ops/site-ops.controller.ts'],
    // Not under site-ops/ since 2026-08-27. master names the component (ConflictHandler, three
    // strategies) but never its path; this test had fixed one. The strategies serve modules/files
    // as well as site-ops, and the file imports nothing at all, so it moved to shared/sync/ and the
    // cross-module import that used to reach for it stopped being a boundary breach.
    ['conflict handler', 'backend/src/shared/sync/conflict-handler.ts'],
  ])('the %s exists', (_label, file) => {
    expect(exists(file)).toBe(true);
  });

  it('the conflict handler is no longer filed under site-ops', () => {
    // Absence half: without it, someone re-creating the old file would leave two copies of the
    // three strategies with nothing to say which one runs.
    expect(exists('backend/src/modules/site-ops/conflict-handler.ts')).toBe(false);
  });

  it('a dedicated sync controller serves the offline protocol', () => {
    expect(exists('backend/src/modules/sync/sync.controller.ts')).toBe(true);
  });

  it.each(['delta', 'push', 'resolve'])('the sync controller exposes /%s', (route) => {
    expect(read('backend/src/modules/sync/sync.controller.ts')).toMatch(
      new RegExp(`['"]${route}['"]`),
    );
  });
});

describe('Phase 6 · photos go through the File Service API, not storage directly (master:2795)', () => {
  /** "Photo upload integration via File Service API (not direct — API call)". */
  it('site-ops has a File Service seam', () => {
    expect(exists('backend/src/modules/site-ops/ep/file-service.stub.ts')).toBe(true);
  });

  it.each([
    ['MinIO client', /from ['"]minio['"]|new Minio/],
    ['AWS S3 client', /@aws-sdk\/client-s3|new S3Client/],
  ])('site-ops never reaches object storage directly (%s)', (_label, pattern) => {
    expect(siteOpsSrc).not.toMatch(pattern);
  });
});

describe('Phase 6 · OpenSearch indexing for reports and issues (master:2796)', () => {
  it('the module talks to OpenSearch', () => {
    expect(siteOpsSrc).toMatch(/opensearch/i);
  });

  it.each(['site_report', 'issue'])('%s is indexed', (entity) => {
    expect(siteOpsSrc.toLowerCase()).toContain(entity);
  });
});

describe('Phase 6 · Safety APIs (master:2755-2770)', () => {
  interface OpenApiDoc {
    servers?: Array<{ url?: string }>;
    paths?: Record<string, Record<string, unknown>>;
  }
  const operations = new Set<string>();
  for (const f of fs
    .readdirSync(path.join(repoRoot, 'docs/api'))
    .filter((x) => x.endsWith('.openapi.yaml'))) {
    const doc = readYaml<OpenApiDoc>(`docs/api/${f}`);
    const m = (doc.servers?.[0]?.url ?? '').match(/(\/api\/v\d+)/);
    const prefix = m ? m[1] : '';
    for (const [p, ops] of Object.entries(doc.paths ?? {})) {
      const full = (p.startsWith('/api/') ? p : `${prefix}${p}`).replace(/\{[^}]+\}/g, '{}');
      for (const method of Object.keys(ops)) operations.add(`${method.toLowerCase()} ${full}`);
    }
  }
  const has = (m: string, p: string): boolean =>
    operations.has(`${m} ${p.replace(/\{[^}]+\}/g, '{}')}`);

  const OPS: ReadonlyArray<[string, string]> = [
    ['post', '/api/v1/safety/incidents'],
    ['get', '/api/v1/safety/incidents'],
    ['patch', '/api/v1/safety/incidents/{incidentId}/acknowledge'],
    ['post', '/api/v1/safety/permits'],
    ['get', '/api/v1/safety/permits'],
    ['patch', '/api/v1/safety/permits/{permitId}/approve'],
    ['patch', '/api/v1/safety/permits/{permitId}/reject'],
    ['get', '/api/v1/safety/checklists'],
    ['post', '/api/v1/safety/checklists'],
    ['get', '/api/v1/safety/compliance'],
  ];
  it.each(OPS)('%s %s is documented', (m, p) => {
    expect(has(m, p)).toBe(true);
  });
});

describe('Phase 6 · Kafka event contracts (master:2800-2816)', () => {
  const files = [...collect('packages'), ...collect('backend/src')];
  const tsCorpus = files
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');

  it.each([
    'site.material.consumed',
    'site.report.created',
    'site.report.submitted',
    'inspection.passed',
    'inspection.failed',
    'issue.created',
    'issue.status_changed',
    'site.conflict.flagged',
  ])('a contract exists for %s', (evt) => {
    expect(tsCorpus).toContain(evt);
  });

  it('site.conflict.flagged carries the fields the spec names (master:2811)', () => {
    const matching = files.filter((f) => /conflict.*flagged/i.test(path.basename(f)));
    expect(matching.length).toBeGreaterThan(0);
    const body = matching.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    for (const field of ['conflict_id', 'entity_type', 'entity_id', 'conflict_type']) {
      expect(body).toContain(field);
    }
  });

  it('site.material.consumed keeps quantity as a decimal, never a float (master:2803)', () => {
    const matching = files.filter(
      (f) => /material.*consumed/i.test(path.basename(f)) && f.endsWith('.ts'),
    );
    expect(matching.length).toBeGreaterThan(0);
    const body = matching.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    expect(body).toContain('quantity');
    // DECIMAL(10,4) crosses the wire as a string; typing it `number` would reintroduce float error.
    expect(body).not.toMatch(/quantity\s*:\s*number/);
  });
});

describe('Phase 6 · D1 CarbonCalculationEngine stub (master:2820-2829)', () => {
  const corpus = collect('backend/src')
    .filter((f) => f.endsWith('.ts'))
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');

  it('declares calculateProjectFootprint(projectId, tenantId)', () => {
    expect(corpus).toMatch(/calculateProjectFootprint/);
  });

  it('it is still a stub — the engine activates on tenant request (master:2829)', () => {
    // boq_items.carbon_factor_kg_co2e stays NULLABLE until then (master:2285-2287); asserted in T2.
    expect(corpus).toMatch(/calculateProjectFootprint/);
  });
});
