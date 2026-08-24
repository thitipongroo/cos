// Guards the purchase-request roles against 06-rbac-permission-matrix "Purchase requests".
//
// The controller shipped allowing only PROCUREMENT_OFFICER / PROC_MANAGER / TENANT_ADMIN, while the
// matrix gives PM and Site Engineer RW — so the two roles that actually notice a shortage got 403.
// Nothing caught it: the matrix lives in a Markdown table and @Roles lives in code, with no test
// holding the two together. This is that test — it reads the decorator's own metadata.

import 'reflect-metadata';
import { ROLES_KEY } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { ProcurementController } from '../procurement.controller';

/** The roles @Roles(...) attached to a handler. */
function rolesOf(method: keyof ProcurementController): CosRole[] {
  return (Reflect.getMetadata(ROLES_KEY, ProcurementController.prototype[method]) ??
    []) as CosRole[];
}

describe('purchase requests — RBAC matches 06-rbac-permission-matrix', () => {
  it('lets every role the matrix marks RW / RWD / FULL create one', () => {
    // Matrix row "Purchase requests": PM=RW, Site Engineer=RW, Procurement=RWD, Tenant Admin=FULL.
    expect(rolesOf('createPurchaseRequest')).toEqual(
      expect.arrayContaining([
        CosRole.SITE_ENGINEER,
        CosRole.PROJECT_MANAGER,
        CosRole.PROCUREMENT_OFFICER,
        CosRole.PROC_MANAGER,
        CosRole.TENANT_ADMIN,
      ]),
    );
  });

  it('keeps SITE_ENGINEER — the field app raises requisitions from site', () => {
    // The exact regression that shipped: without this role the mobile "ขอวัสดุ" screen 403s.
    expect(rolesOf('createPurchaseRequest')).toContain(CosRole.SITE_ENGINEER);
  });

  it('does not grant create to roles the matrix marks read-only or —', () => {
    const roles = rolesOf('createPurchaseRequest');
    // Executive=R, Finance=R, Safety=—, CRM=—. SITE_WORKER has no procurement rights at all.
    expect(roles).not.toContain(CosRole.EXECUTIVE);
    expect(roles).not.toContain(CosRole.FINANCE);
    expect(roles).not.toContain(CosRole.SAFETY_OFFICER);
    expect(roles).not.toContain(CosRole.SITE_WORKER);
  });
});
