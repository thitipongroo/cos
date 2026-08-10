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

describe('drawerLinksFor', () => {
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

  it('gives the Project Manager the set from its own drawer mockup', () => {
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

  it('links no BIM screen, because there is none', () => {
    expect(routes(CosRole.PROJECT_MANAGER).some((route) => /bim/i.test(route))).toBe(false);
  });

  it('offers Directory to the crew roles and not to the Site Worker, who has it as a tab', () => {
    expect(routes(CosRole.SITE_ENGINEER)).toContain('/directory');
    expect(routes(CosRole.SAFETY_OFFICER)).toContain('/directory');
    expect(routes(CosRole.SITE_WORKER)).not.toContain('/directory');
  });

  it('drops each role’s own tabs from the shared default set', () => {
    // SITE_ENGINEER's bar is Home | Issues | Inspections | Reports, so two of the default six go.
    expect(routes(CosRole.SITE_ENGINEER)).not.toContain('/reports');
    expect(routes(CosRole.SITE_ENGINEER)).not.toContain('/inspections');
    expect(routes(CosRole.SITE_ENGINEER)).toContain('/incidents');
  });

  it('gives a session with no role nothing role-specific, only the shared rows', () => {
    expect(drawerLinksFor(null)).toEqual([]);
    expect(drawerLinksFor(undefined)).toEqual([]);
  });

  it('never returns a duplicate route within one role', () => {
    for (const role of Object.values(CosRole)) {
      const list = routes(role);
      expect(new Set(list).size).toBe(list.length);
    }
  });
});
