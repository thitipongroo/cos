import { CosRole } from '@cos/types';
import { drawerLinksFor, SHARED_LINKS } from '../drawerLinks';
import { ALL_TABS } from '../roleTabs';

const routes = (role: CosRole): string[] => drawerLinksFor(role).map((link) => link.route);

describe('SHARED_LINKS', () => {
  it('is exactly Settings and the Support Centre', () => {
    // PO decision 2026-08-10: those two, and nothing else, are the same for every role.
    expect(SHARED_LINKS.map((link) => link.route)).toEqual(['/account-settings', '/support']);
  });
});

describe('drawerLinksFor — the invariants', () => {
  it('never offers a role a route that is already one of its tabs', () => {
    // A drawer row onto a tab is a second door onto the same room. Checked for EVERY role against
    // the tab table itself, so the two cannot drift apart.
    for (const role of Object.values(CosRole)) {
      const tabs = new Set(
        ALL_TABS.filter((tab) => tab.roles.includes(role)).map((tab) => `/${tab.name}`),
      );
      const duplicated = routes(role).filter((route) => tabs.has(route));
      expect({ role, duplicated }).toEqual({ role, duplicated: [] });
    }
  });

  it('never returns a duplicate route within one role', () => {
    for (const role of Object.values(CosRole)) {
      const list = routes(role);
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it('gives a session with no role nothing role-specific, only the shared rows', () => {
    expect(drawerLinksFor(null)).toEqual([]);
    expect(drawerLinksFor(undefined)).toEqual([]);
  });

  it('gives SYSTEM_ADMIN no tenant modules — §6.7 keeps it out of every tenant', () => {
    expect(routes(CosRole.SYSTEM_ADMIN)).toEqual([]);
  });
});

describe('drawerLinksFor — the two roles whose drawer is DRAWN', () => {
  it('gives the Project Manager the set from its own mockup', () => {
    // 06_project_manager/05_navigation_drawer, minus BIM Progress Audit — 00-glossary.md puts full
    // BIM integration post-MVP, so there is no screen to link.
    expect(routes(CosRole.PROJECT_MANAGER)).toEqual([
      '/dashboard',
      '/projects',
      '/reports',
      '/material-request',
      '/issues',
      '/incidents',
      '/directory',
    ]);
  });

  it('keeps `/projects` for the Project Manager, whose Projects TAB was given up', () => {
    // The 2026-08-10 bar swap took the slot for Finance. A screen must not lose its last entry point
    // in a swap, and the drawer is where it went.
    expect(routes(CosRole.PROJECT_MANAGER)).toContain('/projects');
  });

  it('gives the Tenant Admin its drawing, NOT everything §6.4 would allow it', () => {
    // 04_tenant_admin/05_navigation_drawer. This role holds FULL almost everywhere, so derivation
    // would hand it fifteen rows; the drawing is the narrower, deliberate answer and it wins.
    expect(routes(CosRole.TENANT_ADMIN)).toEqual([
      '/projects',
      '/reports',
      '/incidents',
      '/material-request',
    ]);
    expect(routes(CosRole.TENANT_ADMIN)).not.toContain('/payments');
  });

  it('links no BIM or Equipment Logs screen, because neither exists', () => {
    for (const role of Object.values(CosRole)) {
      expect(routes(role).some((route) => /bim|equipment|drawing-viewer/i.test(route))).toBe(false);
    }
  });
});

describe('drawerLinksFor — derived from §6.4 / §6.8', () => {
  it('never offers a role a module its permission cell is “—” on', () => {
    // The point of deriving: no drawer row can lead to a 403.
    expect(routes(CosRole.CRM_SALES_MANAGER)).not.toContain('/inspections'); // §6.4 Inspections: —
    expect(routes(CosRole.CRM_SALES_MANAGER)).not.toContain('/rfqs'); // §6.4 RFQ: —
    expect(routes(CosRole.SAFETY_OFFICER)).not.toContain('/budget'); // §6.4 Budget (view): —
    expect(routes(CosRole.SITE_ENGINEER)).not.toContain('/rfqs'); // §6.4 RFQ: —
    expect(routes(CosRole.SITE_WORKER)).not.toContain('/budget'); // §6.8 Site Worker: no finance row
    expect(routes(CosRole.PROC_MANAGER)).not.toContain('/inspections'); // §6.8: no inspections row
  });

  it('offers what the cell does grant', () => {
    // Each pair is "the cell grants it AND it is not that role's own tab" — both halves matter, and
    // the first draft of this test forgot the second: it asserted SAFETY_OFFICER sees /inspections,
    // which that role reaches from its bottom bar, so the drawer correctly leaves it out.
    expect(routes(CosRole.EXECUTIVE)).toContain('/inspections'); // Inspections / QC: R
    expect(routes(CosRole.FINANCE)).toContain('/vendors'); // Vendor management: R
    expect(routes(CosRole.PROC_MANAGER)).toContain('/budget'); // §6.8 Budget (view): R
    expect(routes(CosRole.SITE_WORKER)).toContain('/reports'); // §6.8 Site reports: RW
    expect(routes(CosRole.SAFETY_OFFICER)).toContain('/safety-checklist'); // Safety checklists: RWD
  });

  it('gives the read-only Viewer the finance and procurement modules §6.8 grants it', () => {
    // "Procurement (all) R" and "Finance (all) R" — a long drawer, and an honest one: those really
    // are the screens this role may open beside its four tabs.
    expect(routes(CosRole.VIEWER)).toEqual(
      expect.arrayContaining([
        '/rfqs',
        '/orders',
        '/deliveries',
        '/invoices',
        '/vendors',
        '/payments',
      ]),
    );
  });

  it('offers the crew directory only to the roles the app already gave it', () => {
    // Not derived: §6.4 names no module that governs a contact list.
    expect(routes(CosRole.SITE_ENGINEER)).toContain('/directory');
    expect(routes(CosRole.SAFETY_OFFICER)).toContain('/directory');
    expect(routes(CosRole.FINANCE)).not.toContain('/directory');
    expect(routes(CosRole.SITE_WORKER)).not.toContain('/directory'); // it is that role's TAB
  });

  it('drops each role’s own tabs from its derived set', () => {
    // SITE_ENGINEER's bar is Home | Issues | Inspections | Reports, so two derived rows go.
    expect(routes(CosRole.SITE_ENGINEER)).not.toContain('/reports');
    expect(routes(CosRole.SITE_ENGINEER)).not.toContain('/inspections');
    expect(routes(CosRole.SITE_ENGINEER)).toContain('/incidents');
  });

  it('gives no role an empty drawer by accident', () => {
    // SYSTEM_ADMIN is the one legitimate empty (§6.7); every other role must have somewhere to go.
    for (const role of Object.values(CosRole)) {
      if (role === CosRole.SYSTEM_ADMIN) continue;
      expect({ role, count: routes(role).length }).not.toEqual({ role, count: 0 });
    }
  });
});
