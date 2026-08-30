/**
 * Phase 2 Generate items 07, 09, 13 — master:1942-1955, 1957-1960, 1967-1973
 *
 *   item 07 "OpenAPI 3.1 specs — two separate files (QM-2: one file per service):
 *              docs/api/auth.openapi.yaml   — OTP request/verify, refresh, logout endpoints
 *              docs/api/tenant.openapi.yaml — tenant lifecycle (SYSTEM_ADMIN) AND user management"
 *   item 09 the three MFA/TOTP endpoints
 *   item 13 the four user-management endpoints
 *
 * QM-2: "Every HTTP endpoint must include a version prefix: /api/v1/". In OpenAPI that prefix may
 * sit on the path OR on the server URL — both satisfy the mandate, so both are accepted here.
 */
import { exists, readYaml } from '../helpers';

interface OpenApiDoc {
  openapi?: string;
  servers?: Array<{ url?: string }>;
  paths?: Record<string, Record<string, unknown>>;
}

const AUTH = 'docs/api/auth.openapi.yaml';
const TENANT = 'docs/api/tenant.openapi.yaml';

const load = (rel: string): OpenApiDoc => readYaml<OpenApiDoc>(rel);

/** Server prefix (e.g. "/api/v1") that every path in the doc inherits. */
const serverPrefix = (doc: OpenApiDoc): string => {
  const url = doc.servers?.[0]?.url ?? '';
  const m = url.match(/(\/api\/v\d+)/);
  return m ? m[1] : '';
};

/** Full, version-prefixed paths declared by a document. */
const fullPaths = (doc: OpenApiDoc): string[] => {
  const prefix = serverPrefix(doc);
  return Object.keys(doc.paths ?? {}).map((p) => (p.startsWith('/api/') ? p : `${prefix}${p}`));
};

/** true when the doc declares `method path`, tolerating {id} vs {tenantId} naming. */
const hasOperation = (doc: OpenApiDoc, method: string, target: string): boolean => {
  const prefix = serverPrefix(doc);
  const wanted = target.replace(/\{[^}]+\}/g, '{}');
  for (const [p, ops] of Object.entries(doc.paths ?? {})) {
    const full = (p.startsWith('/api/') ? p : `${prefix}${p}`).replace(/\{[^}]+\}/g, '{}');
    if (full === wanted && Object.keys(ops).some((m) => m.toLowerCase() === method)) return true;
  }
  return false;
};

describe('Phase 2 · two OpenAPI documents, QM-2 one per service (master:1942)', () => {
  it.each([AUTH, TENANT])('%s exists', (f) => {
    expect(exists(f)).toBe(true);
  });

  it.each([AUTH, TENANT])('%s declares OpenAPI 3.1', (f) => {
    expect(load(f).openapi).toMatch(/^3\.1/);
  });

  it.each([AUTH, TENANT])('%s declares at least one path', (f) => {
    expect(Object.keys(load(f).paths ?? {}).length).toBeGreaterThan(0);
  });
});

describe('Phase 2 · QM-2 every endpoint is version-prefixed (master:754)', () => {
  it.each([AUTH, TENANT])('%s — every path resolves under /api/v1', (f) => {
    const offenders = fullPaths(load(f)).filter((p) => !p.startsWith('/api/v1/'));
    expect(offenders).toEqual([]);
  });
});

describe('Phase 2 · auth endpoints (master:1943; context/01:175-176)', () => {
  const doc = () => load(AUTH);
  const OPS: ReadonlyArray<[string, string]> = [
    ['post', '/api/v1/auth/otp/request'],
    ['post', '/api/v1/auth/otp/verify'],
    ['post', '/api/v1/auth/refresh'],
    ['post', '/api/v1/auth/logout'],
  ];
  it.each(OPS)('%s %s is documented', (method, p) => {
    expect(hasOperation(doc(), method, p)).toBe(true);
  });
});

describe('Phase 2 · MFA TOTP endpoints (master:1957-1960)', () => {
  const doc = () => load(AUTH);
  const OPS: ReadonlyArray<[string, string]> = [
    ['post', '/api/v1/auth/mfa/enroll'],
    ['post', '/api/v1/auth/mfa/verify'],
    ['post', '/api/v1/auth/mfa/authenticate'],
  ];
  it.each(OPS)('%s %s is documented', (method, p) => {
    expect(hasOperation(doc(), method, p)).toBe(true);
  });
});

describe('Phase 2 · tenant + user management endpoints (master:1946-1955)', () => {
  const doc = () => load(TENANT);
  const OPS: ReadonlyArray<[string, string]> = [
    ['get', '/api/v1/users'],
    ['post', '/api/v1/users'],
    ['patch', '/api/v1/users/{userId}/role'],
    ['patch', '/api/v1/users/{userId}/deactivate'],
    ['get', '/api/v1/admin/tenants'],
    ['post', '/api/v1/admin/tenants'],
    ['patch', '/api/v1/admin/tenants/{id}/dedicated-db'],
    ['patch', '/api/v1/admin/tenants/{id}/deactivate'],
    ['get', '/api/v1/tenant/settings'],
    ['patch', '/api/v1/tenant/settings'],
  ];
  it.each(OPS)('%s %s is documented', (method, p) => {
    expect(hasOperation(doc(), method, p)).toBe(true);
  });
});
