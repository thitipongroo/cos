// Behaviour of the root layout — the launch gate and the auth gate.
//
// Two rules, and both are about what the app does before it knows anything.
//
// THE GATE OPENS WHATEVER HAPPENS. The first render is held until the persisted session is restored,
// so the auth gate makes its decision ONCE with the correct state rather than flipping login↔home
// after a cold start. But none of the hydrate() calls guards its own SecureStore read, so any of
// them can reject — and a gate that never opens is an app that never launches. A store that cannot
// read its key falls back to its default and the app still mounts.
//
// (That rejection also has to be CAUGHT, not merely survived: `.finally()` returns a new promise
// that rejects with the same reason, and on the root gate an uncaught one is an unhandled rejection
// at launch. This spec's failing-hydrate case is what covers that.)
//
// THE AUTH GATE WAITS FOR THE NAVIGATOR. expo-router throws "Attempted to navigate before mounting
// the Root Layout component" if it is asked to redirect too early, so the effect no-ops until the
// root navigation state has a key. After that it is symmetric: an unauthenticated caller anywhere
// outside (auth) goes to login, an authenticated one inside (auth) goes home, and anyone already in
// the right place is left alone — a redirect fired on every render would be a navigation loop.

import { render, waitFor } from '@testing-library/react-native';
import { useAuthStore } from '../../store/authStore';
import { useLocaleStore } from '../../store/localeStore';
import { useThemeStore } from '../../store/themeStore';
import { useBiometricStore } from '../../store/biometricStore';
import RootLayout from '../_layout';

const mockReplace = jest.fn();
let mockSegments: string[] = [];
let mockNavKey: string | undefined = 'nav-1';

// `app-launch-loading` is the testID of the BOUNDARY, which is mounted throughout — it is not a
// signal that the gate is shut. What proves the gate is a marker inside <Slot />: LoadingBoundary
// renders only the loader while loading and does not mount its children, so the marker appears
// exactly when the app tree does.
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as typeof import('react-native');
  return {
    Slot: () => <View testID="app-tree" />,
    useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
    useSegments: () => mockSegments,
    useRootNavigationState: () => (mockNavKey === undefined ? {} : { key: mockNavKey }),
  };
});

let mockFontsLoaded = true;
jest.mock('expo-font', () => ({ useFonts: () => [mockFontsLoaded, null] }));
// The Google-fonts package `require`s .ttf files, which jest has no transform for. The weights are
// a launch detail, not a rule of this layout.
jest.mock('@expo-google-fonts/inter-tight', () => ({
  InterTight_400Regular: 'InterTight_400Regular',
  InterTight_500Medium: 'InterTight_500Medium',
  InterTight_600SemiBold: 'InterTight_600SemiBold',
  InterTight_700Bold: 'InterTight_700Bold',
}));
// The real provider renders nothing until an onLayout gives it insets, which never fires here — so
// the whole app tree below it would be invisible to the test for a reason that has nothing to do
// with the gate. The shim hands the children straight through with fixed metrics.
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context') as Record<string, unknown>;
  return {
    ...actual,
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
  };
});
jest.mock('expo-linking', () => ({
  addEventListener: () => ({ remove: jest.fn() }),
  parse: () => ({}),
  getInitialURL: () => Promise.resolve(null),
}));

// The launch side effects. Each is real machinery with its own tests; what this file is about is
// the gate in front of them.
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

function renderApp() {
  return render(<RootLayout />);
}

/** Put every hydrate() under the test's control. */
function setHydrators(hydrate: () => Promise<void>) {
  useAuthStore.setState({ hydrate, isAuthenticated: false } as never);
  useLocaleStore.setState({ hydrate } as never);
  useThemeStore.setState({ hydrate } as never);
  useBiometricStore.setState({ hydrate, locked: false } as never);
}

describe('RootLayout', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockSegments = ['(app)'];
    mockNavKey = 'nav-1';
    mockFontsLoaded = true;
    setHydrators(() => Promise.resolve());
  });

  it('does not mount the app tree until the session is restored', async () => {
    // EVERY hydrate is held, not just one: the gate waits on all of them, so releasing a single
    // store would leave it shut for a reason the test did not intend.
    const release: (() => void)[] = [];
    setHydrators(
      () =>
        new Promise<void>((resolve) => {
          release.push(resolve);
        }),
    );

    const { getByTestId, queryByTestId } = await renderApp();

    expect(getByTestId('app-launch-loading')).toBeTruthy();
    expect(queryByTestId('app-tree')).toBeNull();

    for (const open of release) open();
    await waitFor(() => expect(queryByTestId('app-tree')).toBeTruthy());
  });

  it('opens the gate once the session is restored', async () => {
    const { getByTestId } = await renderApp();

    await waitFor(() => expect(getByTestId('app-tree')).toBeTruthy());
  });

  // A GATE THAT NEVER OPENS IS AN APP THAT NEVER LAUNCHES. A store that cannot read its key falls
  // back to its default; the launch does not fail with it.
  it('opens the gate even when a store cannot read its key', async () => {
    setHydrators(() => Promise.reject(new Error('SecureStore unavailable')));

    const { getByTestId } = await renderApp();

    await waitFor(() => expect(getByTestId('app-tree')).toBeTruthy());
  });

  it('still routes after a failed hydrate, rather than sitting on the splash', async () => {
    setHydrators(() => Promise.reject(new Error('SecureStore unavailable')));

    await renderApp();

    // Unauthenticated is the safe reading of a session that could not be restored.
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(auth)/login'));
  });

  // expo-router throws if asked to navigate before the root layout has mounted.
  it('waits for the navigator before redirecting anywhere', async () => {
    mockNavKey = undefined;

    await renderApp();

    await waitFor(() => expect(mockReplace).not.toHaveBeenCalled());
  });

  it('sends an unauthenticated caller to login', async () => {
    mockSegments = ['(app)'];

    await renderApp();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(auth)/login'));
  });

  // Already in the right place — a redirect on every render is a navigation loop.
  it('leaves an unauthenticated caller alone inside the auth group', async () => {
    mockSegments = ['(auth)'];

    await renderApp();

    await waitFor(() => expect(mockReplace).not.toHaveBeenCalled());
  });

  it('sends a signed-in caller out of the auth group', async () => {
    mockSegments = ['(auth)'];
    useAuthStore.setState({ hydrate: () => Promise.resolve(), isAuthenticated: true } as never);

    await renderApp();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(app)/home'));
  });

  it('leaves a signed-in caller alone inside the app', async () => {
    mockSegments = ['(app)'];
    useAuthStore.setState({ hydrate: () => Promise.resolve(), isAuthenticated: true } as never);

    await renderApp();

    await waitFor(() => expect(mockReplace).not.toHaveBeenCalled());
  });

  // Background refresh being off is a degraded mode, not a launch failure.
  it('launches when the OS refuses to schedule background sync', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bg = require('../../sync/BackgroundSyncTask') as { scheduleBackgroundSync: jest.Mock };
    bg.scheduleBackgroundSync.mockRejectedValue(new Error('background refresh off'));

    const { getByTestId } = await renderApp();

    await waitFor(() => expect(getByTestId('app-tree')).toBeTruthy());
  });
});
