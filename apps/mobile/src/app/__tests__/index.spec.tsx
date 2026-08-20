// Behaviour of the '/' entry route.
//
// It exists because the auth gate's redirect is ASYNCHRONOUS: without a route at '/', a cold launch
// resolves to expo-router's "Unmatched Route" screen before the gate has run. This redirect is
// synchronous and deterministic, and the root layout has already held rendering until the session is
// hydrated, so `isAuthenticated` is correct by the time it renders.
//
// THE AUTHENTICATED TARGET IS THE ROLE'S FIRST TAB, not a fixed /home. SITE_WORKER has no Home tab
// (PO 2026-08-08), so sending it there landed a worker on a screen their own bottom bar could not
// reach — a dead end reachable only by launching the app. `landingRouteFor` is the single source, and
// it is covered in the logic suite; what is asserted here is that this route asks it rather than
// keeping a route of its own.

import { render } from '@testing-library/react-native';
import { CosRole } from '@cos/types';
import { landingRouteFor } from '../../lib/landingRoute';
import { useAuthStore } from '../../store/authStore';
import Index from '../index';

const mockRedirect = jest.fn();

jest.mock('expo-router', () => ({
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href);
    return null;
  },
}));

function renderIndex() {
  return render(<Index />);
}

describe('Index', () => {
  beforeEach(() => mockRedirect.mockReset());

  it('sends a caller with no session to login', async () => {
    useAuthStore.setState({ isAuthenticated: false, role: null } as never);

    await renderIndex();

    expect(mockRedirect).toHaveBeenCalledWith('/(auth)/login');
  });

  it('sends a caller with no session to login even if a role lingers', async () => {
    useAuthStore.setState({ isAuthenticated: false, role: CosRole.SITE_ENGINEER } as never);

    await renderIndex();

    expect(mockRedirect).toHaveBeenCalledWith('/(auth)/login');
  });

  // THE ROLE'S OWN FIRST TAB. Read from landingRouteFor rather than restated — a copy here would
  // pass while the app sent the user somewhere else.
  it('sends a signed-in engineer to their own first tab', async () => {
    useAuthStore.setState({ isAuthenticated: true, role: CosRole.SITE_ENGINEER } as never);

    await renderIndex();

    expect(mockRedirect).toHaveBeenCalledWith(landingRouteFor(CosRole.SITE_ENGINEER));
  });

  // The case the fixed /home broke: this role has no Home tab at all.
  it('sends a signed-in site worker somewhere their own tab bar can reach', async () => {
    useAuthStore.setState({ isAuthenticated: true, role: CosRole.SITE_WORKER } as never);

    await renderIndex();

    expect(mockRedirect).toHaveBeenCalledWith(landingRouteFor(CosRole.SITE_WORKER));
  });

  it('sends a signed-in admin to their own first tab', async () => {
    useAuthStore.setState({ isAuthenticated: true, role: CosRole.TENANT_ADMIN } as never);

    await renderIndex();

    expect(mockRedirect).toHaveBeenCalledWith(landingRouteFor(CosRole.TENANT_ADMIN));
  });

  // A session restored before the role claim arrives still has to land somewhere.
  it('still redirects when the role has not arrived yet', async () => {
    useAuthStore.setState({ isAuthenticated: true, role: null } as never);

    await renderIndex();

    expect(mockRedirect).toHaveBeenCalledWith(landingRouteFor(null));
  });

  // Synchronous and deterministic — that is the whole reason this file exists.
  it('redirects on the first render, without waiting', async () => {
    useAuthStore.setState({ isAuthenticated: false, role: null } as never);

    await renderIndex();

    expect(mockRedirect).toHaveBeenCalledTimes(1);
  });
});
