/**
 * Phase 3 Generate item 05 — master:2187, against the endpoint lists at master:2160-2179
 *
 *   "OpenAPI 3.1 spec with all endpoints documented"
 *
 * QM-2: every endpoint carries the /api/v1 prefix — on the path or on the server URL.
 */
import * as fs from 'fs';
import * as path from 'path';
import { readYaml, repoRoot } from '../helpers';

interface OpenApiDoc {
  openapi?: string;
  servers?: Array<{ url?: string }>;
  paths?: Record<string, Record<string, unknown>>;
}

/** Every OpenAPI document in docs/api — the spec does not name one file for Phase 3. */
const docs = fs
  .readdirSync(path.join(repoRoot, 'docs/api'))
  .filter((f) => f.endsWith('.openapi.yaml'))
  .map((f) => ({ file: `docs/api/${f}`, doc: readYaml<OpenApiDoc>(`docs/api/${f}`) }));

const prefixOf = (d: OpenApiDoc): string => {
  const m = (d.servers?.[0]?.url ?? '').match(/(\/api\/v\d+)/);
  return m ? m[1] : '';
};

/**
 * The one document mounted outside `/api/v1`, with the reason recorded where it is used rather than
 * hidden in a filter. credential-service registers its routes at the root because Kong owns external
 * routing, and its two public GETs are served on a separate host rather than under `api.*` — §5.9.8
 * and §14.5 are authoritative, and §14.3 carries the row. Two assertions at the bottom of this file
 * keep the exception honest: one fails if a SECOND document starts skipping the prefix, one fails if
 * credential-service ever gains one and this exception goes stale.
 */
const ROOT_MOUNTED = ['docs/api/credential.openapi.yaml'];

/** All (method, full path) pairs across every document, with {param} names normalised. */
const operations = new Set<string>();
for (const { file, doc } of docs) {
  if (ROOT_MOUNTED.includes(file)) continue;
  const prefix = prefixOf(doc);
  for (const [p, ops] of Object.entries(doc.paths ?? {})) {
    const full = (p.startsWith('/api/') ? p : `${prefix}${p}`).replace(/\{[^}]+\}/g, '{}');
    for (const m of Object.keys(ops)) {
      if (['get', 'post', 'patch', 'put', 'delete'].includes(m.toLowerCase())) {
        operations.add(`${m.toLowerCase()} ${full}`);
      }
    }
  }
}

const has = (method: string, p: string): boolean =>
  operations.has(`${method} ${p.replace(/\{[^}]+\}/g, '{}')}`);

describe('Phase 3 · project endpoints (master:2161-2169)', () => {
  const OPS: ReadonlyArray<[string, string]> = [
    ['post', '/api/v1/projects'],
    ['get', '/api/v1/projects'],
    ['get', '/api/v1/projects/{id}'],
    ['patch', '/api/v1/projects/{id}'],
    ['post', '/api/v1/projects/{id}/transitions'],
    ['post', '/api/v1/projects/{id}/members'],
    ['delete', '/api/v1/projects/{id}/members/{userId}'],
    ['get', '/api/v1/projects/{id}/members'],
    ['get', '/api/v1/projects/{id}/documents'],
  ];
  it.each(OPS)('%s %s is documented', (m, p) => {
    expect(has(m, p)).toBe(true);
  });
});

describe('Phase 3 · spatial hierarchy endpoints (master:2174-2179)', () => {
  /** Nested create/list under the parent, flat get/update/delete by own id (master:2171-2172). */
  const NESTED: ReadonlyArray<[string, string]> = [
    ['/api/v1/projects/{projectId}/buildings', '/api/v1/buildings/{id}'],
    ['/api/v1/buildings/{buildingId}/floors', '/api/v1/floors/{id}'],
    ['/api/v1/floors/{floorId}/rooms', '/api/v1/rooms/{id}'],
    ['/api/v1/buildings/{buildingId}/structures', '/api/v1/structures/{id}'],
    ['/api/v1/buildings/{buildingId}/units', '/api/v1/units/{id}'],
    ['/api/v1/projects/{projectId}/assets', '/api/v1/assets/{id}'],
  ];

  it.each(NESTED)('POST + GET %s', (collection) => {
    expect(has('post', collection)).toBe(true);
    expect(has('get', collection)).toBe(true);
  });

  it.each(NESTED)('GET + PATCH + DELETE %s', (_collection, item) => {
    expect(has('get', item)).toBe(true);
    expect(has('patch', item)).toBe(true);
    expect(has('delete', item)).toBe(true);
  });
});

describe('Phase 3 · OpenAPI hygiene (QM-2, master:754)', () => {
  it.each(docs.map((d) => d.file))('%s declares OpenAPI 3.1', (file) => {
    const d = docs.find((x) => x.file === file)!.doc;
    expect(d.openapi).toMatch(/^3\.1/);
  });

  it('no documented operation escapes the /api/v1 prefix', () => {
    const bad = [...operations].filter((op) => !op.split(' ')[1].startsWith('/api/v1/'));
    expect(bad).toEqual([]);
  });

  it('credential-service is the only document mounted outside /api/v1', () => {
    const rootMounted = docs
      .filter(({ doc }) => prefixOf(doc) === '' && Object.keys(doc.paths ?? {}).length > 0)
      .filter(({ doc }) => !Object.keys(doc.paths ?? {}).every((p) => p.startsWith('/api/')))
      .map(({ file }) => file);
    expect(rootMounted.sort()).toEqual(ROOT_MOUNTED);
  });

  it('the root-mounted exception still serves the routes §14.3 says it does', () => {
    // If credential-service ever moves under /api/v1, this fails and the exception above must go.
    const doc = docs.find(({ file }) => file === ROOT_MOUNTED[0])!.doc;
    expect(Object.keys(doc.paths ?? {})).toEqual(
      expect.arrayContaining([
        '/health',
        '/tenants/{tenantId}/did.json',
        '/tenants/{tenantId}/status-lists/{statusListId}',
        '/credentials/issue',
        '/credentials/verify',
        '/credentials/{vcId}/revoke',
      ]),
    );
  });
});
