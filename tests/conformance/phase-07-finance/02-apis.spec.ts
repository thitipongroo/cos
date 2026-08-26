/**
 * Phase 7 API surface — master:2942-2967 plus the three rows §14 adds.
 *
 * WHICH LIST IS AUTHORITATIVE. master's Phase 7 block lists 22 endpoints; §14 Financial APIs lists
 * those plus `payments/{id}/approve`, `contracts/{id}/activate` and `contracts/{id}/terminate`, the
 * last two introduced by ADR-058 — which master:2978-2982 names as a Phase 7 Generate item, so they
 * belong to this phase even though master's own API list was never extended with them. §14 is the
 * endpoint-level source of truth (the same precedence sync-authz.ts records for the sync surface).
 *
 * §14 ALSO lists variations, claims and bonds under /api/v1/finance/*. Those are ADR-059 and
 * ADR-063, both of which state outright that they are POST-MVP and "not added to the MVP phase
 * plan". They are therefore absent from this list on purpose, and their absence from the code is
 * correct rather than a gap.
 */
import { read } from '../helpers';

const CONTROLLER = 'backend/src/modules/finance/finance.controller.ts';
const PUBLIC_CONTROLLER = 'backend/src/modules/finance/contract-sign-public.controller.ts';

/** [method, path] exactly as master:2946-2967 and §14:288-324 write them. */
const EXPECTED: Array<[string, string]> = [
  ['Get', 'finance/budget/:projectId'],
  ['Post', 'finance/budget/:projectId'],
  ['Post', 'finance/budget/:projectId/lines'],
  ['Get', 'finance/cost-transactions'],
  ['Post', 'finance/payments'],
  ['Get', 'finance/payments'],
  ['Patch', 'finance/payments/:paymentId/approve'],
  ['Get', 'finance/reports/variance'],
  ['Post', 'finance/customers'],
  ['Get', 'finance/customers'],
  ['Post', 'finance/contracts'],
  ['Get', 'finance/contracts'],
  ['Post', 'finance/contracts/:id/document'],
  ['Post', 'finance/contracts/:id/sign'],
  ['Post', 'finance/contracts/:id/sign-links'],
  ['Get', 'finance/contracts/:id/signatures'],
  ['Post', 'finance/contracts/:id/activate'],
  ['Post', 'finance/contracts/:id/terminate'],
  ['Post', 'finance/billing'],
  ['Get', 'finance/billing'],
  ['Get', 'finance/billing/:billingId'],
  ['Patch', 'finance/billing/:billingId/approve'],
  ['Post', 'finance/ar-receipts'],
  ['Get', 'finance/cashflow-forecast/:projectId'],
];

const controller = read(CONTROLLER);
const publicController = read(PUBLIC_CONTROLLER);

describe('Phase 7 · every endpoint master and §14 declare exists', () => {
  it.each(EXPECTED)('%s /api/v1/%s', (method, route) => {
    expect(controller).toContain(`@${method}('${route}')`);
  });

  it('the magic-link signing route lives on its own controller (ADR-030)', () => {
    // "tenant-mw excluded" (master:2960): the signer is an external client with no tenant context,
    // so this route cannot sit behind the tenant middleware the rest of the module requires.
    expect(publicController).toContain("@Post('finance/contracts/sign/:token')");
  });
});

describe('Phase 7 · QM-2 — every route is under /api/v1', () => {
  it('the controller declares no absolute path of its own', () => {
    // The prefix comes from setGlobalPrefix('api/v1'); a route that spells it again would answer at
    // /api/v1/api/v1/... instead.
    expect(controller).not.toMatch(/@(Get|Post|Patch|Put|Delete)\('\/?api\/v1/);
  });

  it('every route sits under finance/ (master:2942 canonical prefix)', () => {
    const routes = [...controller.matchAll(/@(?:Get|Post|Patch|Put|Delete)\('([^']*)'\)/g)].map(
      (m) => m[1]!,
    );
    expect(routes.length).toBeGreaterThan(0);
    for (const r of routes) expect(r.startsWith('finance/')).toBe(true);
  });
});

describe('Phase 7 · authorization is actually enforced', () => {
  it('the controller mounts RolesGuard alongside JwtAuthGuard', () => {
    // @Roles is only SetMetadata. Without RolesGuard reading it the decorators are inert and every
    // authenticated user holds every finance capability — the exact defect found in the project
    // module, where all seven controllers carried @Roles and mounted JwtAuthGuard alone.
    expect(controller).toMatch(/@UseGuards\([^)]*JwtAuthGuard[^)]*RolesGuard[^)]*\)/);
  });

  it('every write route carries a role requirement', () => {
    // Reads are gated too here, but the direction that matters is writes: a POST or PATCH with no
    // @Roles above it is open to any authenticated tenant user.
    const lines = controller.split('\n');
    const unguarded: string[] = [];
    lines.forEach((line, i) => {
      const m = line.trim().match(/@(Post|Patch|Put|Delete)\('([^']*)'\)/);
      if (!m) return;
      // @Roles sits within a few lines of the verb decorator, either side of it.
      const window = lines.slice(Math.max(0, i - 3), i + 6).join('\n');
      if (!window.includes('@Roles(')) unguarded.push(`${m[1]} ${m[2]}`);
    });
    expect(unguarded).toEqual([]);
  });
});
