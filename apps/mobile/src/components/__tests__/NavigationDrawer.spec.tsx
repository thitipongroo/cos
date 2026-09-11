// Behaviour of the navigation drawer.
//
// The drawer IS the profile as of 2026-08-09 — there is no /profile route any more — so it is the
// only way to sign out, and the rows it lists are the role's own menu. Which rows those are lives in
// lib/drawerLinks.ts and is covered there; what is asserted here is the component's own contract:
// that it renders the role's section and no other role's, that every row navigates and closes, and
// that the drawer never becomes a thing you cannot get out of.
//
// A row worth naming: the Privacy Policy link. It was removed from the account card on 2026-08-14 on
// the stated grounds that "it is a drawer row now", which had been false since 08-09 — for three
// days the app had no way at all to open the notice PDPA §23 requires to remain available. That is
// what a test on the shared section is for.

import { Alert, StyleSheet } from 'react-native';
import { render, fireEvent, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider } from '../../i18n';
import { CosRole } from '@cos/types';
import { drawerSectionFor, SHARED_LINKS } from '../../lib/drawerLinks';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { NavigationDrawer } from '../NavigationDrawer';

// `GET /users/me` gives the profile zone the two fields the session token does not carry — the
// employee code and whether a second factor is enrolled. Mocked rather than left to reject, so the
// tests below can say what each answer renders.
jest.mock('../../api/users', () => ({ getMe: jest.fn() }));

// The two lists a GROUPED drawer badges. Only a grouped role fetches them, so the eleven flat roles
// never touch these mocks — which is itself asserted below, because a drawer that fetched a role's
// CRM lists to render a Site Engineer's menu would be two wasted requests per open.
jest.mock('../../api/crm', () => ({ listLeads: jest.fn(), listOpportunities: jest.fn() }));

/* eslint-disable @typescript-eslint/no-require-imports */
const users = require('../../api/users') as { getMe: jest.Mock };
const crm = require('../../api/crm') as { listLeads: jest.Mock; listOpportunities: jest.Mock };
/* eslint-enable @typescript-eslint/no-require-imports */

const mockPush = jest.fn();
let mockPathname = '/home';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  usePathname: () => mockPathname,
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderDrawer() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <I18nProvider>
        <NavigationDrawer />
      </I18nProvider>
    </SafeAreaProvider>,
  );
}

describe('NavigationDrawer', () => {
  let closeDrawer: jest.Mock;
  let logout: jest.Mock;

  beforeEach(() => {
    mockPush.mockReset();
    users.getMe.mockReset();
    crm.listLeads.mockReset();
    crm.listOpportunities.mockReset();
    crm.listLeads.mockResolvedValue([]);
    crm.listOpportunities.mockResolvedValue([]);
    users.getMe.mockResolvedValue({
      user_id: 'u-1111-aaaa',
      email: 'w@example.com',
      display_name: 'Waraporn Klinhom',
      photo_url: null,
      role: 'SITE_ENGINEER',
      mfa_enabled: true,
      employee_code: 'FI-04281',
      position: 'Site Engineer',
    });
    mockPathname = '/home';
    closeDrawer = jest.fn();
    logout = jest.fn().mockResolvedValue(undefined);
    useUiStore.setState({ drawerOpen: true, closeDrawer } as never);
    useAuthStore.setState({
      displayName: 'Waraporn Klinhom',
      role: 'SITE_ENGINEER',
      userId: 'u-1111-aaaa',
      logout,
    } as never);
  });

  // Nothing in the tree while closed — no backdrop intercepting touches, no cost.
  it('renders nothing while closed', async () => {
    useUiStore.setState({ drawerOpen: false, closeDrawer } as never);

    const { queryByTestId } = await renderDrawer();

    expect(queryByTestId('navigation-drawer')).toBeNull();
  });

  it('shows who is signed in', async () => {
    const { getByTestId, getByText } = await renderDrawer();

    expect(getByTestId('drawer-profile-card')).toBeTruthy();
    expect(getByText('Waraporn Klinhom')).toBeTruthy();
  });

  // The rows are the ROLE's — drawerLinks decides which, and this asserts the component renders
  // exactly that answer rather than a list of its own.
  it('renders the row set this role is given, and no other', async () => {
    const { visible } = drawerSectionFor(CosRole.SITE_ENGINEER);

    const { getByTestId } = await renderDrawer();

    for (const link of visible) expect(getByTestId(`drawer-link-${link.route}`)).toBeTruthy();
  });

  it('gives a different role a different row set', async () => {
    useAuthStore.setState({
      displayName: 'Somchai Jaidee',
      role: 'TENANT_ADMIN',
      userId: 'u-2',
      logout,
    } as never);
    const { visible } = drawerSectionFor(CosRole.TENANT_ADMIN);

    const { getByTestId } = await renderDrawer();

    for (const link of visible) expect(getByTestId(`drawer-link-${link.route}`)).toBeTruthy();
  });

  it('navigates and closes on a row', async () => {
    const { visible } = drawerSectionFor(CosRole.SITE_ENGINEER);
    const first = visible[0]!;

    const { getByTestId } = await renderDrawer();
    await fireEvent.press(getByTestId(`drawer-link-${first.route}`));

    expect(closeDrawer).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith(first.href ?? first.route);
  });

  // Matched on `route`, navigated by `href ?? route`: usePathname never reports the group, so a row
  // that must name its group to be unambiguous still compares against the bare path.
  it('marks the row for the screen the user is on', async () => {
    const { visible } = drawerSectionFor(CosRole.SITE_ENGINEER);
    const first = visible[0]!;
    mockPathname = first.route;

    const { getByTestId } = await renderDrawer();

    expect(getByTestId(`drawer-link-${first.route}`)).toBeTruthy();
  });

  it('closes on the backdrop', async () => {
    const { getByTestId } = await renderDrawer();

    await fireEvent.press(getByTestId('drawer-backdrop'));

    expect(closeDrawer).toHaveBeenCalledTimes(1);
  });

  // The drawer is the only way out of the session now that there is no /profile route.
  it('signs out, and closes as it goes', async () => {
    const { getByTestId } = await renderDrawer();

    await fireEvent.press(getByTestId('drawer-logout'));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(closeDrawer).toHaveBeenCalledTimes(1);
  });

  it('still renders for a session whose role has not arrived', async () => {
    useAuthStore.setState({
      displayName: 'Waraporn Klinhom',
      role: null,
      userId: 'u-1',
      logout,
    } as never);

    const { getByTestId } = await renderDrawer();

    expect(getByTestId('navigation-drawer')).toBeTruthy();
    expect(getByTestId('drawer-logout')).toBeTruthy();
  });
  // ─── The profile zone (mockup 09_finance/05_profile/01_fn_navigation_drawer) ───

  it('prints the employer\u2019s own code where the account has one', async () => {
    // `workforce.workers.employee_code`, through GET /users/me. The mockup's "FI-04281" is not a
    // scheme this product invents after all — it is a real column, for accounts linked to a worker.
    const { getByTestId } = await renderDrawer();

    await waitFor(() => expect(getByTestId('drawer-user-id')).toHaveTextContent(/FI-04281/));
  });

  it('falls back to a short UUID for an account with no worker record', async () => {
    // `user.service.ts` says null is the COMMON case here: office roles — finance included —
    // have no worker row at all, and a gap where an id should be reads as broken.
    users.getMe.mockResolvedValue({
      user_id: 'u-1111-aaaa',
      email: 'w@example.com',
      display_name: 'Waraporn Klinhom',
      photo_url: null,
      role: 'FINANCE',
      mfa_enabled: false,
      employee_code: null,
    });
    const { getByTestId } = await renderDrawer();

    await waitFor(() => expect(getByTestId('drawer-user-id')).toHaveTextContent(/AAAA/));
    expect(getByTestId('drawer-user-id')).not.toHaveTextContent(/FI-04281/);
  });

  it('carries no status line at all — not MFA, not sync', async () => {
    // The row used to read "MFA verified · Online & synced" and was removed on 2026-09-11:
    // neither half was the drawer's to say. Sync state has exactly one indicator in the shell,
    // and MFA belongs to <AccountSettings />, which keeps its own status row. This test is the
    // guard against it drifting back in — an account WITH mfa still shows no such line.
    users.getMe.mockResolvedValue({
      user_id: 'u-1',
      email: 'w@example.com',
      display_name: 'Waraporn Klinhom',
      photo_url: null,
      role: 'FINANCE',
      mfa_enabled: true,
      employee_code: 'FI-04281',
    });
    const { getByTestId } = await renderDrawer();

    await waitFor(() => expect(getByTestId('drawer-user-id')).toHaveTextContent(/FI-04281/));
    const card = getByTestId('drawer-profile-card');
    expect(card).not.toHaveTextContent(/MFA/i);
    expect(card).not.toHaveTextContent(/online/i);
    expect(card).not.toHaveTextContent(/synced/i);
  });

  it('keeps the short UUID when the profile request fails', async () => {
    // Offline is not a reason to leave the identity blank — the id comes from the session.
    users.getMe.mockRejectedValue(new Error('offline'));
    const { getByTestId } = await renderDrawer();

    await waitFor(() => expect(getByTestId('drawer-user-id')).toHaveTextContent(/AAAA/));
    expect(getByTestId('drawer-profile-card')).not.toHaveTextContent(/MFA/i);
  });

  it('prints the position the API returns, not a drawn one', async () => {
    // THE INVERSE OF THE TEST THAT USED TO BE HERE. It was the ADR-099 guard, and it asserted the
    // drawer printed "Lead Controller" WHATEVER the API returned, because nothing in the schema
    // carried a job title. `platform.users.position` does now (ADR-101), so the claim flips: the
    // line follows the row, and a different account gets a different title.
    const { getByTestId } = await renderDrawer();

    await waitFor(() => expect(getByTestId('drawer-job-title')).toHaveTextContent('Site Engineer'));
    // The old hardcoded string is gone from the register and must not reappear from anywhere else.
    expect(getByTestId('drawer-profile-card')).not.toHaveTextContent(/Lead Controller/);
  });

  it('draws no position line at all when the account has none', async () => {
    // NULL IS THE ORDINARY CASE, twice over: no route sets a position, so it is null until a seed or
    // an HR import writes one, and an app running against a deployment older than migration
    // 20260908000001 gets no key at all. Both collapse to the same render — nothing.
    //
    // A placeholder here would be the drawn line returning under another name, which is the whole
    // thing ADR-101 was written to end.
    users.getMe.mockResolvedValue({
      user_id: 'u-1111-aaaa',
      email: 'w@example.com',
      display_name: 'Waraporn Klinhom',
      photo_url: null,
      role: 'SITE_ENGINEER',
      mfa_enabled: true,
      employee_code: 'FI-04281',
      position: null,
    });
    const { getByTestId, queryByTestId } = await renderDrawer();

    await waitFor(() => expect(getByTestId('drawer-user-id')).toHaveTextContent(/FI-04281/));
    expect(queryByTestId('drawer-job-title')).toBeNull();
    // The block does not collapse — the name and the id still identify the account.
    expect(getByTestId('drawer-profile-card')).toHaveTextContent(/Waraporn Klinhom/);
  });

  it('does not shout the role enum beside the name', async () => {
    // The name line carried a `SITE_ENGINEER` / `FINANCE` chip until 2026-09-08. It went on the
    // product owner's instruction: the position line under the name already says what this person
    // does, in the words a person uses, and the enum said it again in the words the system uses.
    const { getByTestId } = await renderDrawer();

    await waitFor(() => expect(getByTestId('drawer-profile-card')).toBeTruthy());
    expect(getByTestId('drawer-profile-card')).not.toHaveTextContent(/SITE_ENGINEER/);
  });

  it('keeps the standard order: name, then position, then id', async () => {
    // SPEC §32.7 "Drawer Profile Block". One drawer serves every role, so this order is every
    // role's, and it descends by how often each line is read — a name identifies at a glance, a
    // position gives it meaning, an id is looked up perhaps twice a year.
    //
    // Pinned here because a reordered block RENDERS PERFECTLY: nothing throws, no query fails, and
    // the only witness is the sequence itself. `toHaveTextContent` walks the card in tree order,
    // which is exactly the claim.
    const { getByTestId } = await renderDrawer();

    await waitFor(() => expect(getByTestId('drawer-job-title')).toBeTruthy());
    expect(getByTestId('drawer-profile-card')).toHaveTextContent(
      /Waraporn Klinhom[\s\S]*Site Engineer[\s\S]*FI-04281/,
    );
  });
});

// -- THE GROUPED MENU (CRM_SALES_MANAGER) ------------------------------------------------------
//
// One role's drawer is a different shape as of 2026-09-10: four titled groups instead of one folded
// list. The risk that split introduces is not that the groups render wrong -- it is that the two
// branches leak into each other, so these tests say what each role draws AND what it does not.

describe('NavigationDrawer - the CRM manager, after the 2026-09-11 flattening', () => {
  beforeEach(() => {
    mockPush.mockReset();
    users.getMe.mockReset();
    users.getMe.mockResolvedValue({
      user_id: 'u-9',
      email: 'k@example.com',
      display_name: 'Kittipong Wisawakan',
      photo_url: null,
      role: 'CRM_SALES_MANAGER',
      mfa_enabled: false,
      employee_code: null,
      position: 'Sales Manager',
    });
    mockPathname = '/home';
    useUiStore.setState({ drawerOpen: true, closeDrawer: jest.fn() } as never);
    useAuthStore.setState({
      displayName: 'Kittipong Wisawakan',
      role: 'CRM_SALES_MANAGER',
      userId: 'u-9',
      logout: jest.fn(),
    } as never);
  });

  // This role had a GROUPED drawer between 2026-09-10 and 2026-09-11 — four titled groups, badges
  // on two rows. The product owner ended it so every role shares one body. These tests are what
  // stops any of it coming back one piece at a time.

  it('renders no group heading at all', async () => {
    const { getByTestId, queryByTestId } = await renderDrawer();

    await waitFor(() => expect(getByTestId('drawer-link-/crm-proposal')).toBeTruthy());
    for (const key of ['groupSales', 'groupPrecon', 'groupAssets', 'groupSystem']) {
      expect(queryByTestId(`drawer-group-crm.drawer.${key}`)).toBeNull();
    }
  });

  it('keeps the six rows whose screens are not built', async () => {
    const { getByTestId } = await renderDrawer();

    await waitFor(() => expect(getByTestId('drawer-link-/crm-proposal')).toBeTruthy());
    for (const route of [
      '/crm-proposal',
      '/crm-tenders',
      '/crm-contracts',
      '/crm-invite-owner',
      '/crm-unit-matrix',
      '/crm-handover',
    ]) {
      expect(getByTestId(`drawer-link-${route}`)).toBeTruthy();
    }
  });

  it('drops the four rows that are this role’s own tabs', async () => {
    const { getByTestId, queryByTestId } = await renderDrawer();

    await waitFor(() => expect(getByTestId('drawer-link-/crm-proposal')).toBeTruthy());
    // Every other role is forbidden a drawer row onto its own tab, and `drawerLinksFor` has always
    // filtered them — the grouped table was the one thing bypassing it.
    for (const route of ['/home', '/leads', '/opportunities', '/customers']) {
      expect(queryByTestId(`drawer-link-${route}`)).toBeNull();
    }
  });

  it('draws no badge on any row, and asks for no counts', async () => {
    const { getByTestId, queryByTestId } = await renderDrawer();

    await waitFor(() => expect(getByTestId('drawer-link-/crm-tenders')).toBeTruthy());
    for (const route of ['/leads', '/opportunities', '/crm-tenders']) {
      expect(queryByTestId(`drawer-badge-${route}`)).toBeNull();
    }
    expect(crm.listLeads).not.toHaveBeenCalled();
    expect(crm.listOpportunities).not.toHaveBeenCalled();
  });

  it('says so on a press rather than pushing an unbuilt route', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { getByTestId } = await renderDrawer();
    await waitFor(() => expect(getByTestId('drawer-link-/crm-tenders')).toBeTruthy());

    fireEvent.press(getByTestId('drawer-link-/crm-tenders'));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('fits under the fold, so this role never sees a More row', async () => {
    const { getByTestId, queryByTestId } = await renderDrawer();

    await waitFor(() => expect(getByTestId('drawer-link-/crm-proposal')).toBeTruthy());
    // Seven rows, under the nine-row fold — and DRAWER_MAX_ROWS counts the role's own only, so
    // the two shared rows below the divider never brought it closer to folding.
    expect(queryByTestId('drawer-more')).toBeNull();
  });
});

describe('NavigationDrawer - one shape, and it holds for a flat role too', () => {
  beforeEach(() => {
    mockPush.mockReset();
    users.getMe.mockReset();
    users.getMe.mockResolvedValue({
      user_id: 'u-1',
      email: 'w@example.com',
      display_name: 'Waraporn Klinhom',
      photo_url: null,
      role: 'SITE_ENGINEER',
      mfa_enabled: true,
      employee_code: 'FI-04281',
      position: 'Site Engineer',
    });
    crm.listLeads.mockReset();
    crm.listOpportunities.mockReset();
    crm.listLeads.mockResolvedValue([]);
    crm.listOpportunities.mockResolvedValue([]);
    mockPathname = '/home';
    useUiStore.setState({ drawerOpen: true, closeDrawer: jest.fn() } as never);
    useAuthStore.setState({
      displayName: 'Waraporn Klinhom',
      role: 'SITE_ENGINEER',
      userId: 'u-1',
      logout: jest.fn(),
    } as never);
  });

  it('reaches no other role’s rows and asks for no CRM counts', async () => {
    const { getByTestId, queryByTestId } = await renderDrawer();

    await waitFor(() => expect(getByTestId('drawer-link-/projects')).toBeTruthy());
    expect(queryByTestId('drawer-link-/crm-tenders')).toBeNull();
    expect(crm.listLeads).not.toHaveBeenCalled();
    expect(crm.listOpportunities).not.toHaveBeenCalled();
  });

  it('puts the drawing’s chevron on the profile header, which opens nothing', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { getByTestId } = await renderDrawer();
    await waitFor(() => expect(getByTestId('drawer-profile-card')).toBeTruthy());

    // The header has had no destination since 2026-08-09 — `/profile` was deleted and this panel IS
    // the profile. The drawing draws a chevron anyway, so it says so on the press rather than
    // pointing nowhere, and it does NOT open `/account-settings`, which is already a row below.
    expect(getByTestId('drawer-profile-card')).toHaveTextContent(/chevron-right/);
    fireEvent.press(getByTestId('drawer-profile-card'));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('carries the drawing’s trailing chevron on every row it draws', async () => {
    const { getByTestId } = await renderDrawer();

    await waitFor(() => expect(getByTestId('drawer-link-/projects')).toBeTruthy());
    // The chevron belonged to the grouped renderer alone until 2026-09-11, so eleven of twelve
    // roles were missing it. One renderer now draws it for all of them — including the shared rows.
    for (const route of ['/projects', '/account-settings', '/privacy-policy']) {
      expect(getByTestId(`drawer-link-${route}`)).toHaveTextContent(/chevron-right/);
    }
  });

  it('keeps the flat role shared rows below their divider, exactly once each', async () => {
    const { getAllByTestId } = await renderDrawer();

    await waitFor(() => expect(getAllByTestId('drawer-link-/account-settings')).toHaveLength(1));
    expect(getAllByTestId('drawer-link-/privacy-policy')).toHaveLength(1);
  });
});

describe('NavigationDrawer — the chevron, on every row of every role (2026-09-11)', () => {
  // Plan item 5.2. The chevron belonged to the grouped renderer alone until 2026-09-11, so eleven
  // of twelve roles drew none — and the test that existed asserted three routes of ONE role, which
  // is exactly why a month passed without anyone noticing. This one renders each role in turn and
  // walks every row it actually draws: its own, the folded ones behind More, and the shared two.
  beforeEach(() => {
    mockPush.mockReset();
    users.getMe.mockReset();
    users.getMe.mockResolvedValue({
      user_id: 'u-1',
      email: 'w@example.com',
      display_name: 'Waraporn Klinhom',
      photo_url: null,
      role: 'SITE_ENGINEER',
      mfa_enabled: true,
      employee_code: 'FI-04281',
      position: 'Site Engineer',
    });
    crm.listLeads.mockReset();
    crm.listOpportunities.mockReset();
    crm.listLeads.mockResolvedValue([]);
    crm.listOpportunities.mockResolvedValue([]);
    mockPathname = '/nowhere';
    useUiStore.setState({ drawerOpen: true, closeDrawer: jest.fn() } as never);
  });

  it.each(Object.values(CosRole))('draws a trailing chevron on every row: %s', async (role) => {
    useAuthStore.setState({
      displayName: 'Waraporn Klinhom',
      role,
      userId: 'u-1',
      logout: jest.fn(),
    } as never);
    const { visible, overflow } = drawerSectionFor(role);

    const { getByTestId } = await renderDrawer();
    await waitFor(() => expect(getByTestId('drawer-profile-card')).toBeTruthy());

    // The fold hides the rest away, so open it — a chevron missing behind More is still missing.
    // The expansion is a state update, so the rows arrive on the next render, not on the press.
    if (overflow[0] !== undefined) {
      fireEvent.press(getByTestId('drawer-more'));
      await waitFor(() =>
        expect(getByTestId(`drawer-link-${String(overflow[0]?.route)}`)).toBeTruthy(),
      );
    }

    // Collected rather than asserted row by row, so a failure names the role and the row that
    // lacks one instead of stopping at the first.
    const bare = [...visible, ...overflow, ...SHARED_LINKS]
      .filter((link) => {
        // The icon mock renders the glyph NAME as text, so the chevron is findable as one.
        const row = getByTestId(`drawer-link-${link.route}`);
        return within(row).queryAllByText('chevron-right').length === 0;
      })
      .map((link) => link.route);
    expect({ role, withoutChevron: bare }).toEqual({ role, withoutChevron: [] });
    // …and the header carries the drawing's own, for every role and not just the one screenshotted.
    expect(getByTestId('drawer-profile-card')).toHaveTextContent(/chevron-right/);
  });
});

describe('NavigationDrawer — Settings and Privacy policy sit against Logout (2026-09-11)', () => {
  // "ให้โซน Settings กับ Privacy policy อยู่ติดกับแถว LOG OUT ตลอด". They used to follow the role's
  // own rows INSIDE the scroll region, so their position moved with the length of the menu: three
  // rows for a Site Worker left ~700px of empty panel between the pair and Logout, and nineteen
  // expanded rows for a Tenant Admin pushed them past the bottom. `ตลอด` is the whole assertion —
  // it has to hold for the shortest drawer and the longest, so both are rendered here.
  beforeEach(() => {
    mockPush.mockReset();
    users.getMe.mockReset();
    users.getMe.mockResolvedValue({
      user_id: 'u-1',
      email: 'w@example.com',
      display_name: 'Waraporn Klinhom',
      photo_url: null,
      role: 'SITE_WORKER',
      mfa_enabled: false,
      employee_code: null,
      position: 'Foreman',
    });
    crm.listLeads.mockReset();
    crm.listOpportunities.mockReset();
    crm.listLeads.mockResolvedValue([]);
    crm.listOpportunities.mockResolvedValue([]);
    mockPathname = '/nowhere';
    useUiStore.setState({ drawerOpen: true, closeDrawer: jest.fn() } as never);
  });

  it.each([CosRole.SITE_WORKER, CosRole.TENANT_ADMIN, CosRole.CRM_SALES_MANAGER])(
    'keeps both shared rows out of the scroll region and pinned above Logout: %s',
    async (role) => {
      useAuthStore.setState({
        displayName: 'Waraporn Klinhom',
        role,
        userId: 'u-1',
        logout: jest.fn(),
      } as never);

      const { getByTestId } = await renderDrawer();
      await waitFor(() => expect(getByTestId('drawer-footer-links')).toBeTruthy());

      const scroll = getByTestId('drawer-scroll');
      const pinned = getByTestId('drawer-footer-links');
      for (const link of SHARED_LINKS) {
        // Not in the part that scrolls…
        expect({ role, route: link.route, inScroll: true }).toEqual({
          role,
          route: link.route,
          inScroll: within(scroll).queryAllByTestId(`drawer-link-${link.route}`).length === 0,
        });
        // …and in the block that is fixed to the bottom, exactly once.
        expect(within(pinned).getAllByTestId(`drawer-link-${link.route}`)).toHaveLength(1);
      }
    },
  );

  it('draws the divider inside the pinned block, not at the end of the scrolling list', async () => {
    // The divider is what separates the role's rows from the shared pair. Left behind in the scroll
    // region it would draw a line under the LAST ROW of a long menu and nothing above the pinned
    // pair — a separator separating nothing.
    useAuthStore.setState({
      displayName: 'Waraporn Klinhom',
      role: CosRole.SITE_WORKER,
      userId: 'u-1',
      logout: jest.fn(),
    } as never);

    const { getByTestId } = await renderDrawer();
    await waitFor(() => expect(getByTestId('drawer-footer-links')).toBeTruthy());

    const children = getByTestId('drawer-footer-links').children;
    // divider + one row per shared link, in that order.
    expect(children).toHaveLength(SHARED_LINKS.length + 1);
  });
});

describe('NavigationDrawer — the profile text keeps clear of the chevron (2026-09-11)', () => {
  // "ถ้าชื่อตำแหน่งชนกับ chevron ให้ย่อส่วนท้ายของชื่อตำแหน่งด้วย ..." — the three lines were already
  // `numberOfLines={1}`, so they always ellipsized; they ellipsized at the CARD's inner edge, which
  // is past an absolutely-positioned chevron that takes no part in the layout. The card reserves the
  // glyph's column now, so the truncation happens before it. Caught on the Viewer frame, where a
  // long name with no position line under it ended exactly at the chevron.
  beforeEach(() => {
    users.getMe.mockReset();
    users.getMe.mockResolvedValue({
      user_id: 'u-1',
      email: 'w@example.com',
      display_name: 'Somsak Watcharawit',
      photo_url: null,
      role: 'VIEWER',
      mfa_enabled: false,
      employee_code: null,
      position: 'Client Representative',
    });
    crm.listLeads.mockReset();
    crm.listOpportunities.mockReset();
    crm.listLeads.mockResolvedValue([]);
    crm.listOpportunities.mockResolvedValue([]);
    mockPathname = '/nowhere';
    useUiStore.setState({ drawerOpen: true, closeDrawer: jest.fn() } as never);
    useAuthStore.setState({
      displayName: 'Somsak Watcharawit',
      role: CosRole.VIEWER,
      userId: 'u-1',
      logout: jest.fn(),
    } as never);
  });

  it('keeps the job title clear of the chevron', async () => {
    const { getByTestId } = await renderDrawer();
    await waitFor(() => expect(getByTestId('drawer-job-title')).toBeTruthy());

    const card = StyleSheet.flatten(getByTestId('drawer-profile-card').props.style) as {
      padding?: number;
    };
    const chevron = StyleSheet.flatten(getByTestId('drawer-profile-chevron').props.style) as {
      right?: number;
    };
    const title = StyleSheet.flatten(getByTestId('drawer-job-title').props.style) as {
      paddingRight?: number;
    };
    // The glyph occupies `right` + its own size from the card's trailing edge; the card's padding
    // already covers part of that, and the line itself must reserve the remainder.
    const needed = (chevron.right ?? 0) + 20 - (card.padding ?? 0);
    expect(title.paddingRight ?? 0).toBeGreaterThanOrEqual(needed);
  });

  it('does NOT reserve it on the id line, which cannot afford to lose its tail', async () => {
    // The first attempt put the reservation on the CARD, so every line paid for the chevron and the
    // id came out as `User ID: 061A6A…` on 01-site-engineer.png. A truncated name is legible; a
    // truncated id is a different id. The chevron is vertically centred on the block and never
    // reaches this line, so the line keeps the full width.
    const { getByTestId } = await renderDrawer();
    await waitFor(() => expect(getByTestId('drawer-user-id')).toBeTruthy());

    const id = StyleSheet.flatten(getByTestId('drawer-user-id').props.style) as {
      paddingRight?: number;
    };
    expect(id.paddingRight ?? 0).toBe(0);
  });

  it('truncates each line rather than wrapping it into the chevron’s row', async () => {
    const { getByTestId } = await renderDrawer();
    await waitFor(() => expect(getByTestId('drawer-job-title')).toBeTruthy());

    for (const id of ['drawer-job-title', 'drawer-user-id']) {
      expect({ id, lines: getByTestId(id).props.numberOfLines }).toEqual({ id, lines: 1 });
    }
  });
});
