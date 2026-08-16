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
  it('is exactly Settings and the Support Center', () => {
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

  it('gives SITE_ENGINEER the bar its mockups draw, in that order', () => {
    // PO decision 2026-08-12. ORDER IS THE ASSERTION, not just membership: `tasks` had to be moved
    // BELOW `issues` in ALL_TABS to produce it, because the bar renders in table order and the row
    // was previously above (where it serves SITE_WORKER). Left alone it would have read
    // Home | Tasks | Issues | Reports.
    expect(visibleTabsFor(CosRole.SITE_ENGINEER).map((tab) => tab.name)).toEqual([
      'home',
      'issues',
      'tasks',
      'reports',
    ]);
    // The move must not have disturbed the role the row already belonged to.
    expect(visibleTabsFor(CosRole.SITE_WORKER).map((tab) => tab.name)).toEqual([
      'home',
      'tasks',
      'safety-checklist',
      'directory',
    ]);
    // …nor the role that kept Inspections.
    expect(visibleTabsFor(CosRole.SAFETY_OFFICER).map((tab) => tab.name)).toContain('inspections');
  });

  it('gives SAFETY_OFFICER the bar its mockups draw, in that order', () => {
    // PO decision 2026-08-13, and ORDER IS THE ASSERTION for the same reason as SITE_ENGINEER above:
    // the bar renders in ALL_TABS order, and `incidents` had to be MOVED UP beside `inspections` to
    // produce this. Left where it was (below the procurement rows) the bar read
    // Home | Inspections | Reports | Incidents — which is what actually shipped from 2026-08-04 to
    // 2026-08-13, while MobileNav's comment claimed Home | Incidents | Inspections | Reports. Both
    // lines were written in the same commit and disagreed from that day; nothing asserted either,
    // which is why the drift survived. This test is the assertion that was missing.
    //
    // The three drawings under mockup/mobile/07_safety_officer/ agree on
    // Home | Incidents | Checklists | Profile; Profile is no role's tab (§32.7), so Permits takes
    // the slot — §20.7.7's fourth page for this role.
    expect(visibleTabsFor(CosRole.SAFETY_OFFICER).map((tab) => tab.name)).toEqual([
      'home',
      'incidents',
      'inspections',
      'permits',
    ]);
    // "Checklists" is the `inspections` ROUTE relabelled, not a new screen.
    expect(
      visibleTabsFor(CosRole.SAFETY_OFFICER).find((tab) => tab.name === 'inspections')?.titleKey,
    ).toBe('nav.tabs.checklists');
    // Moving the row must not have disturbed the two roles that share the ones around it.
    expect(visibleTabsFor(CosRole.EXECUTIVE).map((tab) => tab.name)).toEqual([
      'home',
      'reports',
      'portfolio',
      'alerts',
    ]);
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

describe('drawerLinksFor — the shared drawing leads every role (PO 2026-08-14)', () => {
  // The drawing was copied to mockup/mobile/02_shared/01_navigation_drawer, byte-identical to
  // 04_tenant_admin/05_navigation_drawer, so it is no longer any one role's menu. Its four buildable
  // rows now open every role's drawer — still gated by §6.4, so none of them can 403.
  // BOTH DRAWINGS WERE WITHDRAWN ON 2026-08-16 (one commit, see drawerLinks.ts header). Nothing here
  // changes: this spec asserts ROUTES, never the presence of a file under mockup/, and ADR-085 keeps
  // the ruling standing without its drawing. DRAWN_ORDER is now the executable record of that order.
  const DRAWN_ORDER = ['/projects', '/reports', '/incidents', '/material-request'];

  it('opens every role on the drawn rows it is allowed, in the drawing’s order', () => {
    for (const role of Object.values(CosRole)) {
      const list = routes(role);
      const lead = list.filter((route) => DRAWN_ORDER.includes(route));
      // whatever of the four this role may open comes first, and in the drawing's order
      expect({ role, lead, head: list.slice(0, lead.length) }).toEqual({
        role,
        lead,
        head: lead,
      });
      expect(lead).toEqual(DRAWN_ORDER.filter((route) => lead.includes(route)));
    }
  });

  it('gives the Tenant Admin the drawn rows AND what §6.4 allows it, no longer just the drawing', () => {
    // Reverses the 2026-08-10 narrowing: that only held because the drawing was filed under this
    // role, and the drawing has moved to 02_shared/.
    expect(routes(CosRole.TENANT_ADMIN).slice(0, 4)).toEqual(DRAWN_ORDER);
    expect(routes(CosRole.TENANT_ADMIN)).toContain('/payments'); // §6.4 Payments: FULL
  });

  it('drops no row the two verbatim drawings used to carry', () => {
    // Nothing may lose its last entry point in the swap. These three are the rows §6.4 governs no
    // module for, so only the PROJECT_MANAGER drawing carried them.
    for (const route of ['/dashboard', '/issues', '/directory']) {
      expect(routes(CosRole.PROJECT_MANAGER)).toContain(route);
    }
    // and the rows it shared with §6.4 survive as drawn rows
    for (const route of DRAWN_ORDER) expect(routes(CosRole.PROJECT_MANAGER)).toContain(route);
  });

  it('keeps `/inspections` in the Site Engineer drawer — master §Phase 10 guarantees it', () => {
    // "Inspections is NOT dropped: /inspections is a derived drawer row for this role … so it
    // reappears in the drawer the moment it leaves the bar" (PO 2026-08-12, when Tasks took the tab).
    expect(routes(CosRole.SITE_ENGINEER)).toContain('/inspections');
  });

  it('links no BIM, Equipment Logs or Drawing Viewer screen, because none exists', () => {
    // The drawing's other two rows. Mapping them onto a route would be inventing one.
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
    // §6.4 Permits: Safety RW, PM RW, Site Engineer R — the row added with the screen on 2026-08-13.
    // SAFETY_OFFICER is absent from this list because /permits is now its TAB, which is the same
    // rule /inspections follows for it.
    expect(routes(CosRole.SITE_ENGINEER)).toContain('/permits');
    expect(routes(CosRole.SAFETY_OFFICER)).not.toContain('/permits');
    expect(routes(CosRole.FINANCE)).not.toContain('/permits'); // §6.4 Permits: —
  });

  it('hands /reports back to the Safety Officer’s drawer now that it left the bar', () => {
    // The 2026-08-13 bar change gave the slot to Permits. §6.4 grants this role R on "Site reports",
    // so the derived row reappears the moment it stops being a tab — the same move /inspections made
    // for SITE_ENGINEER on 2026-08-12, and the reason neither screen was lost in a swap.
    expect(routes(CosRole.SAFETY_OFFICER)).toContain('/reports');
    expect(routes(CosRole.SAFETY_OFFICER)).not.toContain('/incidents'); // its own tab
    expect(routes(CosRole.SAFETY_OFFICER)).not.toContain('/inspections'); // its own tab
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
    // SITE_ENGINEER's bar is Home | Issues | Tasks | Reports, so two derived rows go.
    expect(routes(CosRole.SITE_ENGINEER)).not.toContain('/reports');
    expect(routes(CosRole.SITE_ENGINEER)).not.toContain('/tasks');
    expect(routes(CosRole.SITE_ENGINEER)).toContain('/incidents');
    // …and the one the 2026-08-12 bar change handed BACK to the drawer. Asserted because this is
    // the whole reason dropping Inspections from the bar did not drop it from the app: the derived
    // row exists for this role and was suppressed only while it was a tab.
    expect(routes(CosRole.SITE_ENGINEER)).toContain('/inspections');
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
    // PROCUREMENT_OFFICER lands on exactly seven: the four drawn rows minus /incidents (§6.4 Safety
    // incidents is “—” for it), plus /tasks /invoices /vendors /budget. It took over this case from
    // PROJECT_MANAGER on 2026-08-14 — that role now derives as well as taking the drawn rows, so it
    // is far past seven and exercises the folding case below instead.
    const po = drawerSectionFor(CosRole.PROCUREMENT_OFFICER);
    // Exactly seven — folding here would replace one row with a "More" revealing one row.
    expect(po.visible).toHaveLength(7);
    expect(po.overflow).toEqual([]);
  });

  it('folds at six-plus-More once there is genuinely more than fits', () => {
    // The Executive may read almost every module, so its derived list is far past seven: six rows
    // drawn, the rest behind More. The count is read from `drawerLinksFor` rather than written down,
    // because adding a §6.4 row (Permits did, 2026-08-13) legitimately changes it.
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

  it('leaves Settings and the Support Center out of the count — help is never folded away', () => {
    // They render below the divider, so the seven-row rule cannot bury "where do I get help".
    const exec = drawerSectionFor(CosRole.EXECUTIVE);
    const folded = [...exec.visible, ...exec.overflow].map((link) => link.route);
    for (const shared of SHARED_LINKS) expect(folded).not.toContain(shared.route);
  });
});
