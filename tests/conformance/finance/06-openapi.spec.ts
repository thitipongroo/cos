/**
 * Phase 7 Generate item — "OpenAPI 3.1 spec" (master:2977).
 *
 * The contract-signing endpoints are named as a Phase 7 deliverable in their own right
 * (master:2978-2982), so they are inside this item's scope, not adjacent to it. An endpoint that
 * exists but appears in no published spec is one an integrator cannot call and a reviewer cannot
 * check against §14.
 */
import { read, readYaml } from '../helpers';

const SPEC = 'docs/api/finance.openapi.yaml';

interface OpenApiDoc {
  openapi?: string;
  paths?: Record<string, Record<string, unknown>>;
}

const doc = readYaml<OpenApiDoc>(SPEC);
const documented = Object.keys(doc.paths ?? {});

/** `:param` -> `{param}`, so a controller route and an OpenAPI path can be compared. */
const toOpenApiPath = (route: string): string => '/' + route.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

const controllerRoutes = (file: string): Array<{ method: string; path: string }> =>
  [...read(file).matchAll(/@(Get|Post|Patch|Put|Delete)\('([^']*)'\)/g)].map((m) => ({
    method: m[1]!.toLowerCase(),
    path: toOpenApiPath(m[2]!),
  }));

const routes = [
  ...controllerRoutes('backend/src/modules/finance/finance.controller.ts'),
  ...controllerRoutes('backend/src/modules/finance/contract-sign-public.controller.ts'),
];

/** OpenAPI path params may be named differently from the controller's; compare by shape. */
const shape = (p: string): string => p.replace(/\{[^}]+\}/g, '{}');
const documentedShapes = new Map<string, string>(documented.map((p) => [shape(p), p]));

describe('Phase 7 · the finance OpenAPI document (master:2977)', () => {
  it('exists and declares OpenAPI 3.1', () => {
    expect(doc.openapi).toMatch(/^3\.1/);
  });

  it('documents at least one path', () => {
    expect(documented.length).toBeGreaterThan(0);
  });
});

describe('Phase 7 · every implemented finance route is documented', () => {
  it.each(routes.map((r) => [`${r.method.toUpperCase()} ${r.path}`, r] as const))(
    '%s',
    (_label, route) => {
      const match = documentedShapes.get(shape(route.path));
      expect(match).toBeDefined();
      expect(Object.keys(doc.paths![match!]!).map((m) => m.toLowerCase())).toContain(route.method);
    },
  );
});

describe('Phase 7 · the document describes nothing that does not exist', () => {
  it.each(documented)('%s is implemented', (docPath) => {
    // The other direction. A documented endpoint with no route behind it is a 404 an integrator
    // finds only at runtime.
    const implemented = routes.some((r) => shape(r.path) === shape(docPath));
    expect(implemented).toBe(true);
  });
});
