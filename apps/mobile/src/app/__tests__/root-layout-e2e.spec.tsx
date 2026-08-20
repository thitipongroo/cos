// The root layout's E2E deep-link listener — `cos://e2e/network` and `cos://e2e/reset`.
//
// THIS IS THE ONLY PLUMBING THE DETOX SUITE HAS FOR TWO THINGS IT CANNOT OTHERWISE DO. Detox has no
// connectivity toggle (`device.setStatusBar({network})` is a status-bar appearance API, not a real
// one), and the iOS keychain survives an app reinstall — so without these two links a suite cannot
// exercise an offline flow at all, and cannot start the login tests from a signed-out state.
//
// The Detox job is written but has never been executed (it waits on seven repository secrets), so
// this spec is currently the ONLY thing verifying that either link is wired. That is why it is here
// rather than being left to the E2E run it belongs to.
//
// INERT IN PRODUCTION, and that is asserted first. `isE2EEnabled()` is false unless
// EXPO_PUBLIC_E2E === '1', and a deep link that could log a real user out or lie to them about their
// connection is the kind of thing that must be proved dead, not assumed dead.

import { render, waitFor } from '@testing-library/react-native';
import { useAuthStore } from '../../store/authStore';
import { useLocaleStore } from '../../store/localeStore';
import { useThemeStore } from '../../store/themeStore';
import { useBiometricStore } from '../../store/biometricStore';
import { getForcedOnline, __resetNetworkOverrideForTests } from '../../lib/e2e/networkOverride';
import RootLayout from '../_layout';

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as typeof import('react-native');
  return {
    Slot: () => <View testID="app-tree" />,
    useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
    useSegments: () => ['(app)'],
    useRootNavigationState: () => ({ key: 'nav-1' }),
  };
});

jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('@expo-google-fonts/inter-tight', () => ({
  InterTight_400Regular: 'InterTight_400Regular',
  InterTight_500Medium: 'InterTight_500Medium',
  InterTight_600SemiBold: 'InterTight_600SemiBold',
  InterTight_700Bold: 'InterTight_700Bold',
}));
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context') as Record<string, unknown>;
  return {
    ...actual,
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
  };
});

// `parse` is backed by the WHATWG URL parser rather than by a hand-written matcher: the real
// expo-linking parse reaches expo-constants for the app scheme and throws off-device, and a stub
// that pattern-matched the links this test sends would only prove that the stub agrees with the
// test. `new URL()` is a real parser, and the mapping below is just expo-linking's shape
// (hostname / path without its leading slash / queryParams).
let mockInitialUrl: string | null = null;
let mockListener: ((event: { url: string }) => void) | null = null;
const mockRemove = jest.fn();
jest.mock('expo-linking', () => {
  const actual = jest.requireActual('expo-linking') as Record<string, unknown>;
  return {
    ...actual,
    getInitialURL: () => Promise.resolve(mockInitialUrl),
    parse: (url: string) => {
      const parsed = new URL(url);
      const path = parsed.pathname.replace(/^\//, '');
      return {
        hostname: parsed.hostname || parsed.host || null,
        path: path === '' ? null : path,
        queryParams: Object.fromEntries(parsed.searchParams.entries()),
      };
    },
    addEventListener: (_event: string, cb: (e: { url: string }) => void) => {
      mockListener = cb;
      return { remove: mockRemove };
    },
  };
});

jest.mock('../../db/sync-queue', () => ({
  initSyncQueue: jest.fn(),
  subscribeQueueChanged: jest.fn(() => jest.fn()),
  countPending: jest.fn(() => Promise.resolve(0)),
}));
jest.mock('../../sync/queueObserver', () => ({ startQueueObserver: jest.fn(() => jest.fn()) }));
jest.mock('../../sync/syncRunner', () => ({ runSyncCycle: jest.fn() }));
jest.mock('../../sync/BackgroundSyncTask', () => ({
  registerBackgroundSyncTask: jest.fn(),
  scheduleBackgroundSync: jest.fn(() => Promise.resolve()),
}));

const mockLogout = jest.fn();

function setHydrators() {
  useAuthStore.setState({
    hydrate: () => Promise.resolve(),
    logout: mockLogout,
    isAuthenticated: false,
  } as never);
  useLocaleStore.setState({ hydrate: () => Promise.resolve() } as never);
  useThemeStore.setState({ hydrate: () => Promise.resolve() } as never);
  useBiometricStore.setState({ hydrate: () => Promise.resolve(), locked: false } as never);
}

/** Deliver a link the way the OS would, once the app is running. */
async function openLink(url: string) {
  await waitFor(() => expect(mockListener).not.toBeNull());
  mockListener?.({ url });
}

describe('RootLayout — E2E deep links', () => {
  const realFlag = process.env['EXPO_PUBLIC_E2E'];

  beforeEach(() => {
    mockInitialUrl = null;
    mockListener = null;
    mockRemove.mockReset();
    mockLogout.mockReset().mockResolvedValue(undefined);
    __resetNetworkOverrideForTests();
    setHydrators();
  });

  afterEach(() => {
    if (realFlag === undefined) delete process.env['EXPO_PUBLIC_E2E'];
    else process.env['EXPO_PUBLIC_E2E'] = realFlag;
    __resetNetworkOverrideForTests();
  });

  // ── DEAD IN PRODUCTION ───────────────────────────────────────────────────────────────────────

  describe('with E2E off', () => {
    beforeEach(() => {
      delete process.env['EXPO_PUBLIC_E2E'];
    });

    // NOT EVEN SUBSCRIBED. A listener that existed and then checked the flag would still be one
    // handler away from acting on a link a real user could be sent.
    it('registers no link listener at all', async () => {
      const { getByTestId } = await render(<RootLayout />);

      await waitFor(() => expect(getByTestId('app-tree')).toBeTruthy());
      expect(mockListener).toBeNull();
    });

    it('leaves the real connection in charge', async () => {
      await render(<RootLayout />);

      expect(getForcedOnline()).toBeNull();
    });
  });

  // ── LIVE UNDER DETOX ─────────────────────────────────────────────────────────────────────────

  describe('with E2E on', () => {
    beforeEach(() => {
      process.env['EXPO_PUBLIC_E2E'] = '1';
    });

    it('listens for links', async () => {
      const { getByTestId } = await render(<RootLayout />);

      await waitFor(() => expect(getByTestId('app-tree')).toBeTruthy());
      expect(mockListener).not.toBeNull();
    });

    // OFFLINE IS THE WHOLE POINT: this app's offline behaviour is most of what it does, and there is
    // no other way for a Detox suite to reach it.
    it('forces the app offline', async () => {
      await render(<RootLayout />);

      await openLink('cos://e2e/network?online=0');

      await waitFor(() => expect(getForcedOnline()).toBe(false));
    });

    it('forces the app back online', async () => {
      await render(<RootLayout />);

      await openLink('cos://e2e/network?online=0');
      await waitFor(() => expect(getForcedOnline()).toBe(false));

      await openLink('cos://e2e/network?online=1');

      await waitFor(() => expect(getForcedOnline()).toBe(true));
    });

    // Both spellings, because a helper written later should not have to guess which one the app
    // parses — and `online=true` is the one a person writes by hand while debugging.
    it.each([
      ['true', true],
      ['false', false],
    ])('accepts online=%s', async (value, expected) => {
      await render(<RootLayout />);

      await openLink(`cos://e2e/network?online=${value}`);

      await waitFor(() => expect(getForcedOnline()).toBe(expected));
    });

    // A link with no parameter changes nothing, rather than defaulting to one of the two states —
    // a malformed link that silently forced the app offline would show up as a flaky suite, not as
    // a broken link.
    it('changes nothing on a network link with no parameter', async () => {
      await render(<RootLayout />);

      await openLink('cos://e2e/network');

      expect(getForcedOnline()).toBeNull();
    });

    // THE RESET LINK EXISTS BECAUSE THE KEYCHAIN OUTLIVES THE APP. `delete: true` on reinstall does
    // not clear it, so without this the login suite launches already authenticated.
    it('signs the session out on the reset link', async () => {
      await render(<RootLayout />);

      await openLink('cos://e2e/reset');

      await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));
    });

    // And it clears the network override with it: a suite that reset mid-run would otherwise carry
    // the previous test's forced-offline state into a test that never asked for it.
    it('clears a forced connection on reset', async () => {
      await render(<RootLayout />);

      await openLink('cos://e2e/network?online=0');
      await waitFor(() => expect(getForcedOnline()).toBe(false));

      await openLink('cos://e2e/reset');

      await waitFor(() => expect(getForcedOnline()).toBeNull());
    });

    // A LINK LAUNCHES THE APP as often as it arrives while it is running — Detox sends the reset
    // before the first test, when the process is starting.
    it('handles a link the app was launched with', async () => {
      mockInitialUrl = 'cos://e2e/network?online=0';

      await render(<RootLayout />);

      await waitFor(() => expect(getForcedOnline()).toBe(false));
    });

    // ── LINKS THAT ARE NOT THIS ──────────────────────────────────────────────────────────────

    // Anything that is not the `e2e` host is left entirely alone: this listener sits in front of
    // every deep link the app receives, including whatever it grows next.
    it.each([
      ['cos://issues/abc'],
      ['cos://e2eee/network?online=0'],
      ['https://example.com/e2e/network?online=0'],
    ])('ignores %s', async (url) => {
      await render(<RootLayout />);

      await openLink(url);

      expect(getForcedOnline()).toBeNull();
      expect(mockLogout).not.toHaveBeenCalled();
    });

    // A path under the right host that means nothing does nothing — not a reset, which is the
    // destructive one of the two.
    it('ignores an unknown path under the e2e host', async () => {
      await render(<RootLayout />);

      await openLink('cos://e2e/something-else');

      expect(getForcedOnline()).toBeNull();
      expect(mockLogout).not.toHaveBeenCalled();
    });

    it('survives being launched with no link', async () => {
      mockInitialUrl = null;

      const { getByTestId } = await render(<RootLayout />);

      await waitFor(() => expect(getByTestId('app-tree')).toBeTruthy());
      expect(getForcedOnline()).toBeNull();
    });

    // The subscription is torn down with the layout, so a remounted root does not stack handlers —
    // two live listeners would apply a single link twice.
    it('stops listening when the layout goes', async () => {
      const { unmount } = await render(<RootLayout />);
      await waitFor(() => expect(mockListener).not.toBeNull());

      await unmount();

      expect(mockRemove).toHaveBeenCalledTimes(1);
    });
  });
});
