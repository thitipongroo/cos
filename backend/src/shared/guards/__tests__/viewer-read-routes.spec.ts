// Guards ADR-103: the six read routes opened to VIEWER, and the write routes that must stay shut.
//
// WHY A TEST AND NOT A COMMENT. `docs/specifications/06-rbac-permission-matrix.md` §6.8 grants this
// role R on the whole procurement and finance modules, and for months not one of the 23 GET routes
// in those two controllers listed it — a Markdown table and a decorator disagreeing with nothing
// holding them together. That is the same gap `purchase-request-rbac.spec.ts` was written for, and
// this is the VIEWER half of it.
//
// It reads the decorator's own metadata, so it fails on the edit rather than in a screenshot.

import 'reflect-metadata';
import { ROLES_KEY } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { ProcurementController } from '../../../modules/procurement/procurement.controller';
import { FinanceController } from '../../../modules/finance/finance.controller';
import { SiteOpsController } from '../../../modules/site-ops/site-ops.controller';

/**
 * A controller CLASS, seen only as a prototype to read metadata off.
 *
 * `object` rather than an index signature: a Nest controller is a normal class, and asking
 * TypeScript to treat it as `Record<string, unknown>` fails because it has no index signature. The
 * lookup below is deliberately dynamic — the whole point is to enumerate handlers by name.
 */
type Ctor = { prototype: object };

/**
 * The roles `@Roles(...)` attached to a handler, or `[]` where the decorator is absent.
 *
 * A MISSING HANDLER THROWS BY NAME. `Reflect.getMetadata(key, undefined)` raises a bare TypeError
 * from inside reflect-metadata, which says nothing about which method was misspelled — and the
 * first version of this file misspelled four of them. A renamed handler should fail this test with
 * its own name in the message.
 */
function rolesOf(controller: Ctor, method: string): CosRole[] {
  const handler = (controller.prototype as Record<string, unknown>)[method];
  if (typeof handler !== 'function') {
    throw new Error(`no handler named ${method} on ${controller.constructor.name || 'controller'}`);
  }
  return (Reflect.getMetadata(ROLES_KEY, handler) ?? []) as CosRole[];
}

/**
 * The six handlers ADR-103 opened, by controller and method name.
 *
 * Named by METHOD rather than by path because that is what carries the metadata. The comment on
 * each says which route it is, so a reader does not have to open the controller to check.
 */
const OPENED: readonly [Ctor, string, string][] = [
  [ProcurementController, 'listAllPurchaseOrders', 'GET /procurement/purchase-orders'],
  [ProcurementController, 'listAllDeliveries', 'GET /procurement/deliveries'],
  [FinanceController, 'getBudget', 'GET /finance/budget/:projectId'],
  [FinanceController, 'listTransactions', 'GET /finance/cost-transactions'],
  [FinanceController, 'getCashflowForecast', 'GET /finance/cashflow-forecast/:projectId'],
  [SiteOpsController, 'listIssues', 'GET /site/issues'],
];

/**
 * Handlers that MUST NOT accept a VIEWER.
 *
 * These are the ones a viewer could plausibly be given by accident while opening the reads beside
 * them — the approvals and the writes on the same three controllers. §6.8 ends with "Viewer does
 * not have write, delete, or approve access on any module", and this is where that sentence is
 * enforced rather than asserted.
 */
const MUST_STAY_SHUT: readonly [Ctor, string, string][] = [
  [ProcurementController, 'createPurchaseOrder', 'POST /procurement/purchase-orders'],
  [ProcurementController, 'approvePo', 'PATCH …/purchase-orders/:poId/approve'],
  [ProcurementController, 'approveInvoice', 'PATCH …/vendor-invoices/:invoiceId/approve'],
  [ProcurementController, 'createVendor', 'POST /procurement/vendors'],
  [FinanceController, 'createOrUpdateBudget', 'POST /finance/budget/:projectId'],
  [SiteOpsController, 'createIssue', 'POST /site/issues'],
];

describe('ADR-103 — the six read routes opened to VIEWER', () => {
  it.each(OPENED)('lets VIEWER read %#: %s', (controller, method, route) => {
    expect({ route, roles: rolesOf(controller, method) }).toMatchObject({
      route,
      roles: expect.arrayContaining([CosRole.VIEWER]),
    });
  });

  it('opened exactly six and no more across the three controllers', () => {
    // The alternative rejected in ADR-103 was adding VIEWER to each controller's `READ_ROLES`,
    // which would have opened all 24 reads in one edit. This is the assertion that would have
    // failed if someone took that shortcut later.
    const controllers: readonly [Ctor, string][] = [
      [ProcurementController, 'ProcurementController'],
      [FinanceController, 'FinanceController'],
      [SiteOpsController, 'SiteOpsController'],
    ];
    const withViewer: string[] = [];
    for (const [controller, name] of controllers) {
      for (const method of Object.getOwnPropertyNames(controller.prototype)) {
        if (method === 'constructor') continue;
        if (rolesOf(controller, method).includes(CosRole.VIEWER)) {
          withViewer.push(`${name}.${method}`);
        }
      }
    }
    expect(withViewer.sort()).toEqual(
      [
        'FinanceController.getBudget',
        'FinanceController.getCashflowForecast',
        'FinanceController.listTransactions',
        'ProcurementController.listAllPurchaseOrders',
        'ProcurementController.listAllDeliveries',
        'SiteOpsController.listIssues',
      ].sort(),
    );
  });
});

describe('§6.8 — a VIEWER writes, deletes and approves nothing', () => {
  it.each(MUST_STAY_SHUT)('refuses VIEWER on %#: %s', (controller, method, route) => {
    expect({ route, roles: rolesOf(controller, method) }).toMatchObject({
      route,
      roles: expect.not.arrayContaining([CosRole.VIEWER]),
    });
  });
});
