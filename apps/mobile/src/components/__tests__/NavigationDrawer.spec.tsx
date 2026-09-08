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

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider } from '../../i18n';
import { CosRole } from '@cos/types';
import { drawerSectionFor } from '../../lib/drawerLinks';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { NavigationDrawer } from '../NavigationDrawer';

// `GET /users/me` gives the profile zone the two fields the session token does not carry — the
// employee code and whether a second factor is enrolled. Mocked rather than left to reject, so the
// tests below can say what each answer renders.
jest.mock('../../api/users', () => ({ getMe: jest.fn() }));

/* eslint-disable @typescript-eslint/no-require-imports */
const users = require('../../api/users') as { getMe: jest.Mock };
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
    users.getMe.mockResolvedValue({
      user_id: 'u-1111-aaaa',
      email: 'w@example.com',
      display_name: 'Waraporn Klinhom',
      photo_url: null,
      role: 'SITE_ENGINEER',
      mfa_enabled: true,
      employee_code: 'FI-04281',
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

  it('prints the drawn job title, whatever the API returns', async () => {
    // THE ADR-099 GUARD. No table carries a job title: `platform.users` has none and
    // `workforce.workers` has trade_type, which is a site trade rather than a position.
    //
    // Asserted on the CARD, not on the id line. The two were one <Text> until a device capture
    // showed the title clipped off the end of it — `numberOfLines={1}` and a UUID fallback longer
    // than the drawing's short employee code — so the figure was registered, tested and invisible.
    const { getByTestId } = await renderDrawer();

    await waitFor(() =>
      expect(getByTestId('drawer-profile-card')).toHaveTextContent(/Lead Controller/),
    );
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
      /Waraporn Klinhom[\s\S]*Lead Controller[\s\S]*FI-04281/,
    );
  });
});
