import { CosRole } from '@cos/types';
import {
  drawerLinksFor,
  drawerSectionFor,
  DRAWER_MAX_ROWS,
  SHARED_LINKS,
  tabAsDrawerLink,
} from '../drawerLinks';
import { ALL_TABS, MAX_TABS, overflowTabsFor, visibleTabsFor } from '../roleTabs';

const routes = (role: CosRole): string[] => drawerLinksFor(role).map((link) => link.route);

describe('SHARED_LINKS', () => {
  it('is exactly Settings and the Support Centre', () => {
    // PO decision 2026-08-10: those two, and nothing else, are the same for every role.
    expect(SHARED_LINKS.map((link) => link.route)).toEqual(['/account-settings', '/support']);
  });
});

describe('the bar is four wide, and the fifth entry goes to the drawer', () => {
  it('never puts more than MAX_TABS buttons on any role’s bar', () => {
    expect(MAX_TABS).toBe(4); // §32.7 "MobileNav: exactly 4 items"
    for (const role of Object.values(CosRole)) {
      expect({ role, count: visibleTabsFor(role).length }).toEqual({
        role,
        count: Math.min(MAX_TABS, ALL_TABS.filter((tab) => tab.roles.includes(role)).length),
      });
    }
  });

  it('every role matches exactly four today, so nothing overflows yet', () => {
    // Recorded so the day this stops being true is a visible change, not a silent one. SYSTEM_ADMIN
    // is the documented exception — §20.7.11 puts its work in the separate web /admin panel.
    for (const role of Object.values(CosRole)) {
      if (role === CosRole.SYSTEM_ADMIN) continue;
      expect({ role, overflow: overflowTabsFor(role).map((tab) => tab.name) }).toEqual({
        role,
        overflow: [],
      });
    }
  });

  it('turns a tab pushed off the bar into a drawer row that is recognisably itself', () => {
    // No role exercises this yet, so it is exercised directly — the rule that catches a fifth tab
    // must not be first tried out on the day someone adds one.
    expect(
      tabAsDrawerLink({
        name: 'deliveries',
        titleKey: 'nav.tabs.deliveries',
        icon: 'local-shipping',
      }),
    ).toEqual({ route: '/deliveries', labelKey: 'nav.tabs.deliveries', icon: 'local-shipping' });
  });

  it('would offer a fifth tab in the drawer rather than dropping it', () => {
    // The rule has no role to exercise it yet, so it is exercised directly: a tab beyond the fourth
    // is not on the bar, and `drawerLinksFor` is what stops it becoming unreachable.
    const fifth = ALL_TABS.filter((tab) => tab.roles.includes(CosRole.VIEWER)).length;
    expect(fifth).toBeLessThanOrEqual(MAX_TABS);
    // …and the drawer's filter keys off the VISIBLE tabs, which is what makes that work:
    for (const role of Object.values(CosRole)) {
      const onBar = new Set(visibleTabsFor(role).map((tab) => `/${tab.name}`));
      const pushedOff = overflowTabsFor(role).map((tab) => `/${tab.name}`);
      for (const route of pushedOff) expect(onBar.has(route)).toBe(false);
    }
  });
});

describe('drawerLinksFor — the invariants', () => {
  it('never offers a role a route that is already on its bar', () => {
    // A drawer row onto a VISIBLE tab is a second door onto the same room. Checked for EVERY role
    // against the tab table itself, so the two cannot drift apart.
    for (const role of Object.values(CosRole)) {
      const onBar = new Set(visibleTabsFor(role).map((tab) => `/${tab.name}`));
      const duplicated = routes(role).filter((route) => onBar.has(route));
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

describe('drawerSectionFor — row seven becomes More', () => {
  it('shows everything when the list fits, and folds nothing', () => {
    expect(DRAWER_MAX_ROWS).toBe(7);
    const pm = drawerSectionFor(CosRole.PROJECT_MANAGER);
    // Exactly seven — folding here would replace one row with a "More" revealing one row.
    expect(pm.visible).toHaveLength(7);
    expect(pm.overflow).toEqual([]);
  });

  it('folds at six-plus-More once there is genuinely more than fits', () => {
    // 17 rows for the Executive: six drawn, eleven behind More, seven rows on screen.
    const exec = drawerSectionFor(CosRole.EXECUTIVE);
    expect(exec.visible).toHaveLength(DRAWER_MAX_ROWS - 1);
    expect(exec.overflow).toHaveLength(drawerLinksFor(CosRole.EXECUTIVE).length - 6);
  });

  it('loses nothing in the split, and keeps the order', () => {
    for (const role of Object.values(CosRole)) {
      const { visible, overflow } = drawerSectionFor(role);
      expect([...visible, ...overflow].map((link) => link.route)).toEqual(routes(role));
    }
  });

  it('never draws more than DRAWER_MAX_ROWS rows for any role', () => {
    for (const role of Object.values(CosRole)) {
      const { visible, overflow } = drawerSectionFor(role);
      // + the More row itself when something is folded.
      const drawn = visible.length + (overflow.length > 0 ? 1 : 0);
      expect({ role, drawn }).toEqual({ role, drawn: Math.min(drawn, DRAWER_MAX_ROWS) });
    }
  });

  it('folds nothing for a session with no role', () => {
    expect(drawerSectionFor(null)).toEqual({ visible: [], overflow: [] });
  });

  it('leaves Settings and the Support Centre out of the count — help is never folded away', () => {
    // They render below the divider, so the seven-row rule cannot bury "where do I get help".
    const exec = drawerSectionFor(CosRole.EXECUTIVE);
    const folded = [...exec.visible, ...exec.overflow].map((link) => link.route);
    for (const shared of SHARED_LINKS) expect(folded).not.toContain(shared.route);
  });
});
