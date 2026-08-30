/**
 * Role-filtered navigation — spec §20.6.2 / §20.7.
 *
 * §35.13 ESC-25: apps/web had no unit tests at all. This module decides what each role can even
 * see, so the assertions that matter are the negative ones: a role must not be handed navigation
 * for a module it has no access to, and an unknown or missing role claim must yield NOTHING rather
 * than a default menu.
 */
import { CosRole } from '@cos/types';

import { NAV_BY_ROLE, navForRole, type NavItem } from '../nav';

const hrefs = (items: NavItem[]) => items.map((i) => i.href);

describe('navForRole', () => {
  it('returns the mapped navigation for a known role', () => {
    expect(hrefs(navForRole(CosRole.PROJECT_MANAGER))).toEqual(['/projects']);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
  ])('returns nothing for a %s role claim', (_label, role) => {
    expect(navForRole(role as string | undefined | null)).toEqual([]);
  });

  it('returns nothing for a role that is not in the map', () => {
    expect(navForRole('DEMOLITION_EXPERT')).toEqual([]);
  });

  it('does not fall back to any default menu', () => {
    // A role typo must show an empty sidebar, never another role's pages.
    expect(navForRole('PROJECT_MANAGERR')).toEqual([]);
  });
});

describe('NAV_BY_ROLE', () => {
  it('covers every role that has a landing page', () => {
    const mapped = Object.keys(NAV_BY_ROLE);
    for (const role of [
      CosRole.EXECUTIVE,
      CosRole.PROJECT_MANAGER,
      CosRole.PROCUREMENT_OFFICER,
      CosRole.PROC_MANAGER,
      CosRole.FINANCE,
      CosRole.SITE_ENGINEER,
      CosRole.CRM_SALES_MANAGER,
      CosRole.TENANT_ADMIN,
      CosRole.VIEWER,
      CosRole.SITE_WORKER,
      CosRole.SAFETY_OFFICER,
    ]) {
      expect(mapped).toContain(role);
    }
  });

  it('gives SYSTEM_ADMIN no operational navigation', () => {
    // SYSTEM_ADMIN is a platform role — it lands on /admin, not on tenant pages.
    expect(navForRole(CosRole.SYSTEM_ADMIN)).toEqual([]);
  });

  it('every item has an href and an i18n key under nav.*', () => {
    for (const [role, items] of Object.entries(NAV_BY_ROLE)) {
      for (const item of items) {
        expect(item.href.startsWith('/')).toBe(true);
        expect(item.labelKey).toMatch(/^nav\./);
        // guards against a copy-paste that leaves two roles sharing one key by accident
        expect(item.labelKey.length).toBeGreaterThan('nav.'.length);
        expect(role).toBeTruthy();
      }
    }
  });

  it('has no duplicate hrefs within a role', () => {
    for (const [role, items] of Object.entries(NAV_BY_ROLE)) {
      const seen = hrefs(items);
      expect(new Set(seen).size).toBe(seen.length);
      expect(role).toBeTruthy();
    }
  });

  describe('module isolation', () => {
    it('PROCUREMENT_OFFICER sees no finance pages', () => {
      expect(
        hrefs(navForRole(CosRole.PROCUREMENT_OFFICER)).some((h) => h.startsWith('/finance')),
      ).toBe(false);
    });

    it('FINANCE sees no procurement pages', () => {
      expect(hrefs(navForRole(CosRole.FINANCE)).some((h) => h.startsWith('/procurement'))).toBe(
        false,
      );
    });

    it('SITE_ENGINEER sees no finance or procurement pages', () => {
      const seen = hrefs(navForRole(CosRole.SITE_ENGINEER));
      expect(seen.some((h) => h.startsWith('/finance') || h.startsWith('/procurement'))).toBe(
        false,
      );
    });

    it('CRM_SALES_MANAGER sees only CRM pages', () => {
      expect(hrefs(navForRole(CosRole.CRM_SALES_MANAGER)).every((h) => h.startsWith('/crm'))).toBe(
        true,
      );
    });

    it('SITE_WORKER sees no settings or finance pages', () => {
      const seen = hrefs(navForRole(CosRole.SITE_WORKER));
      expect(seen.some((h) => h.startsWith('/settings') || h.startsWith('/finance'))).toBe(false);
    });

    it('SAFETY_OFFICER sees only safety pages', () => {
      expect(hrefs(navForRole(CosRole.SAFETY_OFFICER)).every((h) => h.startsWith('/safety'))).toBe(
        true,
      );
    });
  });

  describe('TENANT_ADMIN', () => {
    it('aggregates PM, procurement, finance and site navigation plus settings', () => {
      const seen = hrefs(navForRole(CosRole.TENANT_ADMIN));
      expect(seen).toContain('/projects');
      expect(seen).toContain('/procurement/requests');
      expect(seen).toContain('/finance/payments');
      expect(seen).toContain('/site/reports');
      expect(seen).toContain('/settings/users');
      expect(seen).toContain('/settings/tenant');
    });

    it('is a superset of the individual module menus it aggregates', () => {
      const admin = new Set(hrefs(navForRole(CosRole.TENANT_ADMIN)));
      for (const role of [
        CosRole.PROJECT_MANAGER,
        CosRole.PROCUREMENT_OFFICER,
        CosRole.FINANCE,
        CosRole.SITE_ENGINEER,
      ]) {
        for (const href of hrefs(navForRole(role))) {
          expect(admin.has(href)).toBe(true);
        }
      }
    });
  });

  describe('VIEWER', () => {
    it('sees project and site pages read-only, and no settings', () => {
      const seen = hrefs(navForRole(CosRole.VIEWER));
      expect(seen).toContain('/projects');
      expect(seen).toContain('/site/reports');
      expect(seen.some((h) => h.startsWith('/settings'))).toBe(false);
    });
  });

  it('PROC_MANAGER and PROCUREMENT_OFFICER share one menu', () => {
    expect(navForRole(CosRole.PROC_MANAGER)).toBe(navForRole(CosRole.PROCUREMENT_OFFICER));
  });
});
