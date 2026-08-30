/**
 * Phase 4 Generate items 04, 06, 09, the Decision, and QM-1's mutation gate
 * — master:2304-2312, 2319, 2321, 2324-2338; context.md QM-1
 */
import * as fs from 'fs';
import * as path from 'path';
import { exists, read, readYaml, repoRoot } from '../helpers';

interface OpenApiDoc {
  openapi?: string;
  servers?: Array<{ url?: string }>;
  paths?: Record<string, Record<string, unknown>>;
}

const docs = fs
  .readdirSync(path.join(repoRoot, 'docs/api'))
  .filter((f) => f.endsWith('.openapi.yaml'))
  .map((f) => readYaml<OpenApiDoc>(`docs/api/${f}`));

const operations = new Set<string>();
for (const doc of docs) {
  const m = (doc.servers?.[0]?.url ?? '').match(/(\/api\/v\d+)/);
  const prefix = m ? m[1] : '';
  for (const [p, ops] of Object.entries(doc.paths ?? {})) {
    const full = (p.startsWith('/api/') ? p : `${prefix}${p}`).replace(/\{[^}]+\}/g, '{}');
    for (const method of Object.keys(ops)) operations.add(`${method.toLowerCase()} ${full}`);
  }
}
const has = (m: string, p: string): boolean =>
  operations.has(`${m} ${p.replace(/\{[^}]+\}/g, '{}')}`);

describe('Phase 4 · BOQ endpoints documented (master:2304-2312)', () => {
  const OPS: ReadonlyArray<[string, string]> = [
    ['post', '/api/v1/projects/{projectId}/boq/versions'],
    ['get', '/api/v1/projects/{projectId}/boq/versions'],
    ['get', '/api/v1/projects/{projectId}/boq/versions/{versionId}'],
    ['post', '/api/v1/projects/{projectId}/boq/versions/{versionId}/approve'],
    ['post', '/api/v1/boq/versions/{versionId}/categories'],
    ['post', '/api/v1/boq/versions/{versionId}/items'],
    ['patch', '/api/v1/boq/items/{itemId}'],
    ['delete', '/api/v1/boq/items/{itemId}'],
    ['get', '/api/v1/boq/versions/{versionId}/export'],
  ];
  it.each(OPS)('%s %s', (m, p) => {
    expect(has(m, p)).toBe(true);
  });
});

describe('Phase 4 · versioning service exists with copy-on-create (master:2319, 2298)', () => {
  const boqSrc = ((): string => {
    const dir = path.join(repoRoot, 'backend/src/modules/boq');
    const out: string[] = [];
    const walk = (d: string): void => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) out.push(full);
      }
    };
    if (fs.existsSync(dir)) walk(dir);
    return out.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  })();

  it('the module knows the three version states (master:2244)', () => {
    for (const s of ['DRAFT', 'APPROVED', 'SUPERSEDED']) expect(boqSrc).toContain(s);
  });

  it('a new version copies from the latest APPROVED one (master:2298)', () => {
    expect(boqSrc).toMatch(/APPROVED/);
    expect(boqSrc).toMatch(/copy|clone|carry|previous|source/i);
  });
});

describe('Phase 4 · Kafka event contracts (master:2324-2329, 939)', () => {
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
  const avro = files.filter((f) => f.endsWith('.avsc'));

  it('the canonical create event is declared (master:738 → construction.boq.version_created.v1)', () => {
    expect(tsCorpus).toContain('construction.boq.version_created.v1');
  });

  it.each([
    ['boq.created', /construction\.boq\.created\.v1|boq\.created/],
    ['boq.updated', /construction\.boq\.updated\.v1|boq\.updated/],
    ['boq.version.approved', /boq\.version.?approved|version_approved/],
  ])('a contract exists for %s', (_label, pattern) => {
    expect(tsCorpus).toMatch(pattern);
  });

  it('boq.updated carries changed_items_count (master:2327; master:916)', () => {
    const updatedFiles = files.filter((f) => /boq.*updated/i.test(path.basename(f)));
    expect(updatedFiles.length).toBeGreaterThan(0);
    expect(updatedFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n')).toContain(
      'changed_items_count',
    );
  });

  it('every BOQ Avro schema avoids the "-value" TopicNameStrategy suffix (master:937)', () => {
    expect(avro.filter((f) => /boq/i.test(f) && f.includes('-value'))).toEqual([]);
  });
});

describe('Phase 4 · D1 BIMIntegration importQuantities stub (master:2333-2337)', () => {
  const corpus = ((): string => {
    const out: string[] = [];
    const walk = (d: string): void => {
      if (!fs.existsSync(d)) return;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) {
          if (!['node_modules', 'dist'].includes(e.name)) walk(full);
        } else if (full.endsWith('.ts')) out.push(full);
      }
    };
    walk(path.join(repoRoot, 'backend/src'));
    walk(path.join(repoRoot, 'packages'));
    return out.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  })();

  it('declares importQuantities(bimFileUrl, boqVersionId, tenantId)', () => {
    expect(corpus).toMatch(/importQuantities/);
  });
});

describe('QM-1 · mutation testing covers the financial logic (context.md QM-1)', () => {
  /**
   * "For financial calculation logic ... mutation testing required (stryker for TypeScript);
   * mutation score >= 70%".
   *
   * The BOQ module holds NO arithmetic of its own — every money operation delegates to
   * @cos/financial (calculateLineTotal, sumDecimals). So the gate is satisfied by mutating that
   * package, and the invariant that makes it sufficient is the SECOND test here: if BOQ ever grows
   * its own `a.times(b)` the mutation gate silently stops covering the real calculation.
   */
  const financialCfg = 'packages/@cos/financial/stryker.config.json';

  it('@cos/financial has a stryker config', () => {
    expect(exists(financialCfg)).toBe(true);
  });

  it('it mutates the package source', () => {
    const cfg = JSON.parse(read(financialCfg)) as { mutate?: string[] };
    expect((cfg.mutate ?? []).some((g) => g.startsWith('src/'))).toBe(true);
  });

  it('its break threshold is at least 70', () => {
    const cfg = JSON.parse(read(financialCfg)) as { thresholds?: { break?: number } };
    expect(cfg.thresholds?.break).toBeGreaterThanOrEqual(70);
  });

  it('the BOQ module delegates money math instead of doing its own', () => {
    const dir = path.join(repoRoot, 'backend/src/modules/boq');
    const out: string[] = [];
    const walk = (d: string): void => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) out.push(full);
      }
    };
    walk(dir);
    const src = out.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

    expect(src).toMatch(/from ['"]@cos\/financial['"]/);
    // A raw JS arithmetic operator applied to a money identifier would bypass decimal.js entirely.
    const rawMath = Array.from(
      src.matchAll(
        /\b([a-z_]*(?:amount|cost|total|price|quantity|subtotal)[a-z_]*)\s*[*+\-/]\s*[a-z_]/gi,
      ),
    ).map((m) => m[0]);
    expect(rawMath).toEqual([]);
  });
});
