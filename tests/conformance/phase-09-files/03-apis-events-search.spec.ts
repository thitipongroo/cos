/**
 * Phase 9 — the API surface, search indexing, events, and the two workstreams
 * (master:3234-3248, 3303-3332).
 */
import { read, readYaml } from '../helpers';

const SERVICE = 'services/file-service';
const routes = read(`${SERVICE}/src/routes/files.routes.ts`);
const kafka = read(`${SERVICE}/src/services/kafka.service.ts`);

interface OpenApiDoc {
  openapi?: string;
  paths?: Record<string, Record<string, unknown>>;
}
const doc = readYaml<OpenApiDoc>('docs/api/file.openapi.yaml');

/** master:3304-3309 — [method, route as the Fastify handler registers it, OpenAPI path]. */
const ENDPOINTS: Array<[string, string, string]> = [
  ['post', '/upload', '/files/upload'],
  ['get', '/:fileId/url', '/files/{fileId}/url'],
  ['get', '/:fileId', '/files/{fileId}'],
  ['delete', '/:fileId', '/files/{fileId}'],
  ['get', '/', '/files'],
  ['get', '/by-entity/:entityType/:entityId', '/files/by-entity/{entityType}/{entityId}'],
];

describe('Phase 9 · every endpoint master lists exists (master:3304-3309)', () => {
  it.each(ENDPOINTS)('%s %s', (method, route) => {
    // Fastify registers path and handler across two lines for the longer routes, so match the
    // method and the path independently rather than as one adjacent string.
    expect(routes).toMatch(new RegExp(`app\\.${method}\\(\\s*'${route.replace(/[/:]/g, '\\$&')}'`));
  });
});

describe('Phase 9 · the OpenAPI document (master:3326)', () => {
  it('declares OpenAPI 3.1', () => {
    expect(doc.openapi).toMatch(/^3\.1/);
  });

  it.each(ENDPOINTS)('documents %s %s', (method, _route, docPath) => {
    const entry = doc.paths?.[docPath];
    expect(entry).toBeDefined();
    expect(Object.keys(entry!).map((m) => m.toLowerCase())).toContain(method);
  });
});

describe('Phase 9 · OpenSearch indexing (master:3311-3315)', () => {
  const search = read(`${SERVICE}/src/services/opensearch.service.ts`);
  /**
   * The indexed document only — not the whole file.
   *
   * The header comment says "indexes file metadata for full-text search", so a naive substring
   * search for "metadata" passes on the prose while the document itself carries none. Scope the
   * assertions to the body actually sent to OpenSearch.
   */
  const indexedBody = search.slice(
    search.indexOf('async indexFile'),
    search.indexOf('async indexFile') > -1
      ? search.indexOf('}', search.indexOf('});', search.indexOf('async indexFile')))
      : undefined,
  );

  it('indexes per tenant as files-{tenant_id}', () => {
    // Per-tenant indices, so a query cannot reach another tenant's documents even if a filter is
    // forgotten.
    expect(search).toMatch(/`files-\$\{tenantId\}`/);
  });

  it.each([
    'original_filename',
    'mime_type',
    'entity_type',
    'entity_id',
    'uploaded_by',
    'uploaded_at',
  ])('indexes %s (master:3313-3314)', (field) => {
    expect(indexedBody).toContain(field);
  });

  it('indexes the metadata key-value pairs (master:3314)', () => {
    // The spec lists "metadata key-value pairs" among the indexed fields, and master:3315 makes
    // metadata VALUES one of the two full-text targets. file_metadata is a separate table, so the
    // pairs have to be read and folded into the document at index time — nothing else will put
    // them there.
    expect(indexedBody).toMatch(/metadata/i);
  });

  it('exposes a search over the index it maintains (master:3315)', () => {
    // "Full-text search: on original_filename and metadata values". Indexing documents that nothing
    // ever queries is a write-only index: it costs storage on every upload and answers nothing.
    expect(search).toMatch(/async search|multi_match|\bquery\b/);
  });
});

describe('Phase 9 · Kafka producers (master:3331-3332)', () => {
  it.each(['file.document.uploaded.v1', 'file.document.quarantined.v1'])(
    '%s is published by the service',
    (event) => {
      expect(kafka).toContain(event);
    },
  );

  it.each([
    [
      'file.document.uploaded.v1',
      ['file_id', 'tenant_id', 'entity_type', 'entity_id', 'mime_type'],
    ],
    ['file.document.quarantined.v1', ['file_id', 'tenant_id', 'threat_type']],
  ])('%s carries the fields master names', (event, fields) => {
    // The payload is a typed parameter (`FileDocumentUploadedPayload` from @cos/shared), not an
    // object literal at the publish site, so the contract to check is the interface — which is also
    // the thing a consumer compiles against.
    const contract = read(`packages/@cos/shared/src/events/${event}.ts`);
    for (const f of fields) expect(contract).toMatch(new RegExp(`\\b${f}\\b`));
  });
});

describe('Phase 9 · ZIP extraction guards (master:3244-3248)', () => {
  const zip = read(`${SERVICE}/src/services/zip-extraction.service.ts`);

  it('runs asynchronously in a Temporal worker, not inside the upload request', () => {
    // An archive is extracted after the upload answers, so a 500 MB zip cannot hold a connection
    // open or time one out mid-extraction.
    expect(read(`${SERVICE}/src/extraction/workflows/zip-extraction.workflow.ts`)).toBeTruthy();
    expect(read(`${SERVICE}/src/extraction/worker.ts`)).toMatch(/Worker/);
  });

  it('re-validates every entry rather than trusting the archive', () => {
    // The zip passed the MIME check as a zip; its CONTENTS have passed nothing.
    expect(zip).toMatch(/validateFile/);
  });

  it('guards against zip bombs by ratio, entry count and total size', () => {
    for (const guard of ['maxRatio', 'maxEntries', 'maxTotalBytes']) {
      expect(zip).toContain(guard);
    }
  });

  it('guards against path traversal', () => {
    // An entry named ../../etc/passwd must not be able to choose where it lands.
    expect(zip).toMatch(/traversal|\.\.\//);
  });
});

describe('Phase 9 · CAD viewing is Phase A only (master:3234-3241)', () => {
  const viewer = read('apps/web/src/app/(app)/files/[id]/view/page.tsx');

  it('renders DXF client-side from the signed URL', () => {
    // Phase A: "DXF viewer ... rendered client-side from the existing signed-URL download".
    expect(viewer).toMatch(/dxf-viewer|three-dxf/);
    expect(viewer).toMatch(/\/url/);
  });

  it('leaves DWG as store-and-serve', () => {
    // Phase A explicitly does not convert DWG; the viewer must say so rather than fail obscurely.
    expect(viewer).toMatch(/unsupported/i);
  });

  it('uses no proprietary or paid SDK (master:3235, 3241)', () => {
    // "No proprietary/paid SDK" — the ODA option was superseded precisely because it is paid.
    const web = read('apps/web/package.json');
    expect(web).not.toMatch(/opendesign|\bODA\b|autodesk/i);
  });

  it('has not started Phase B (master:3238-3240)', () => {
    // LibreDWG is GPLv3 and is to be invoked as an isolated subprocess when it arrives. Finding it
    // linked in now would be a licence problem, not just an early feature.
    const svcPkg = read(`${SERVICE}/package.json`);
    expect(`${svcPkg}\n${read('apps/web/package.json')}`).not.toMatch(/libredwg|dwg2dxf/i);
  });
});
