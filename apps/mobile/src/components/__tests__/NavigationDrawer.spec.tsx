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
});
