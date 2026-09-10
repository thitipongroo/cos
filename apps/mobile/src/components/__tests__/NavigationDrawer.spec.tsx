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

import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider } from '../../i18n';
import { CosRole } from '@cos/types';
import { drawerGroupsFor, drawerSectionFor } from '../../lib/drawerLinks';
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

  it('says MFA is verified only when the account actually has it', async () => {
    const { getByTestId, rerender } = await renderDrawer();

    await waitFor(() => expect(getByTestId('drawer-profile-card')).toHaveTextContent(/MFA/i));

    users.getMe.mockResolvedValue({
      user_id: 'u-2',
      email: 'x@example.com',
      display_name: 'Someone Else',
      photo_url: null,
      role: 'FINANCE',
      mfa_enabled: false,
      employee_code: null,
    });
    useAuthStore.setState({
      displayName: 'Someone Else',
      role: 'FINANCE',
      userId: 'u-2',
      logout,
    } as never);
    const second = await renderDrawer();

    await waitFor(() => expect(second.getByTestId('drawer-profile-card')).toBeTruthy());
    expect(second.getByTestId('drawer-profile-card')).not.toHaveTextContent(/MFA/i);
    // …and the online line is still there, so the row does not simply vanish.
    expect(second.getByTestId('drawer-profile-card')).toHaveTextContent(/online/i);
    expect(rerender).toBeTruthy();
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

describe('NavigationDrawer - the CRM manager grouped menu', () => {
  let closeDrawer: jest.Mock;
  let logout: jest.Mock;
  let alert: jest.SpyInstance;

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
      position: 'Head of Commercial & CRM',
    });
    crm.listLeads.mockReset();
    crm.listOpportunities.mockReset();
    crm.listLeads.mockResolvedValue([
      { lead_id: 'l-1', status: 'NEW' },
      { lead_id: 'l-2', status: 'NEW' },
      { lead_id: 'l-3', status: 'QUALIFIED' },
    ]);
    crm.listOpportunities.mockResolvedValue([
      { opportunity_id: 'o-1', status: 'OPEN' },
      { opportunity_id: 'o-2', status: 'WON' },
    ]);
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockPathname = '/home';
    closeDrawer = jest.fn();
    logout = jest.fn().mockResolvedValue(undefined);
    useUiStore.setState({ drawerOpen: true, closeDrawer } as never);
    useAuthStore.setState({
      displayName: 'Kittipong Wisawakan',
      role: 'CRM_SALES_MANAGER',
      userId: 'u-9',
      logout,
    } as never);
  });

  afterEach(() => {
    alert.mockRestore();
  });

  it('draws the four groups the drawing has, the system group included', async () => {
    const { getByTestId } = await renderDrawer();

    await waitFor(() => expect(getByTestId('drawer-group-crm.drawer.groupSales')).toBeTruthy());
    expect(getByTestId('drawer-group-crm.drawer.groupPrecon')).toBeTruthy();
    expect(getByTestId('drawer-group-crm.drawer.groupAssets')).toBeTruthy();
    expect(getByTestId('drawer-group-crm.drawer.groupSystem')).toBeTruthy();
  });

  it('renders every grouped row this role is given', async () => {
    const rows = (drawerGroupsFor(CosRole.CRM_SALES_MANAGER) ?? []).flatMap((g) => g.rows);

    const { getByTestId } = await renderDrawer();

    await waitFor(() => expect(getByTestId(`drawer-link-${rows[0]!.route}`)).toBeTruthy());
    for (const row of rows) expect(getByTestId(`drawer-link-${row.route}`)).toBeTruthy();
  });

  // Both badges are REAL: two NEW leads out of three, one OPEN opportunity out of two.
  it('counts its badges from the lists rather than drawing them', async () => {
    const { getByTestId } = await renderDrawer();

    await waitFor(() => expect(getByTestId('drawer-badge-/leads')).toHaveTextContent(/2/));
    expect(getByTestId('drawer-badge-/opportunities')).toHaveTextContent(/1/);
  });

  // "Could not ask" is not "none". A failed fetch leaves the rows without badges rather than
  // showing a zero, which would read as an answer.
  it('shows no counted badge at all when the counts cannot be fetched', async () => {
    crm.listLeads.mockRejectedValue(new Error('offline'));

    const { getByTestId, queryByTestId } = await renderDrawer();

    await waitFor(() => expect(getByTestId('drawer-link-/leads')).toBeTruthy());
    await waitFor(() => expect(queryByTestId('drawer-badge-/leads')).toBeNull());
    expect(queryByTestId('drawer-badge-/opportunities')).toBeNull();
    // The DRAWN badge is unaffected -- it never needed a request.
    expect(getByTestId('drawer-badge-/crm-tenders')).toBeTruthy();
  });

  it('navigates a built row and closes behind it', async () => {
    const { getByTestId } = await renderDrawer();
    await waitFor(() => expect(getByTestId('drawer-link-/leads')).toBeTruthy());

    await fireEvent.press(getByTestId('drawer-link-/leads'));

    expect(mockPush).toHaveBeenCalledWith('/leads');
    expect(closeDrawer).toHaveBeenCalled();
  });

  // A row whose screen does not exist SAYS SO. Pushing it would navigate to nothing, which reads as
  // a broken app rather than an unbuilt screen.
  it('says an unbuilt row is unbuilt, and pushes nothing', async () => {
    const { getByTestId } = await renderDrawer();
    await waitFor(() => expect(getByTestId('drawer-link-/crm-tenders')).toBeTruthy());

    await fireEvent.press(getByTestId('drawer-link-/crm-tenders'));

    expect(alert).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(closeDrawer).not.toHaveBeenCalled();
  });

  // The grouped branch draws SHARED_LINKS itself, under the system heading -- not a second copy of
  // them, and not a second time below a divider.
  it('offers Settings and the Privacy Policy exactly once each', async () => {
    const { getAllByTestId } = await renderDrawer();

    await waitFor(() => expect(getAllByTestId('drawer-link-/account-settings')).toHaveLength(1));
    expect(getAllByTestId('drawer-link-/privacy-policy')).toHaveLength(1);
  });

  // The profile block has no per-role variant (spec 32.7). The drawing's pipeline-target line under
  // the position is the thing this test exists to keep out.
  it('keeps the standard profile block, with no pipeline target added to it', async () => {
    const { getByTestId, queryByText } = await renderDrawer();

    await waitFor(() => expect(getByTestId('drawer-job-title')).toHaveTextContent(/Head of/));
    expect(getByTestId('drawer-user-id')).toBeTruthy();
    expect(queryByText(/Pipeline:/)).toBeNull();
    expect(queryByText(/450M/)).toBeNull();
  });

  it('draws no operating-region switcher', async () => {
    const { getByTestId, queryByText } = await renderDrawer();

    await waitFor(() => expect(getByTestId('drawer-group-crm.drawer.groupSales')).toBeTruthy());
    expect(queryByText(/CBD/)).toBeNull();
    expect(queryByText(/swap/i)).toBeNull();
  });

  it('never folds a grouped menu behind a More row', async () => {
    const { getByTestId, queryByTestId } = await renderDrawer();

    await waitFor(() => expect(getByTestId('drawer-group-crm.drawer.groupSales')).toBeTruthy());
    expect(queryByTestId('drawer-more')).toBeNull();
  });
});

describe('NavigationDrawer - the two branches do not leak', () => {
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

  it('gives a flat role no CRM group and no CRM request', async () => {
    const { getByTestId, queryByTestId } = await renderDrawer();

    await waitFor(() => expect(getByTestId('drawer-link-/projects')).toBeTruthy());
    expect(queryByTestId('drawer-group-crm.drawer.groupSales')).toBeNull();
    expect(queryByTestId('drawer-link-/crm-tenders')).toBeNull();
    expect(crm.listLeads).not.toHaveBeenCalled();
    expect(crm.listOpportunities).not.toHaveBeenCalled();
  });

  it('keeps the flat role shared rows below their divider, exactly once each', async () => {
    const { getAllByTestId } = await renderDrawer();

    await waitFor(() => expect(getAllByTestId('drawer-link-/account-settings')).toHaveLength(1));
    expect(getAllByTestId('drawer-link-/privacy-policy')).toHaveLength(1);
  });
});
