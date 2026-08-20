// Behaviour of the authenticated app shell.
//
// THE SYNC RUNS AGAIN THE MOMENT THE SIGNAL COMES BACK. `isOnline` is in the effect's dependency
// list, and that is the whole point of the effect: it used to run once on `[]`, so a worker who
// spent a morning filling in reports with no coverage had to leave the app group and come back
// before any of it was sent. The hook already knew when connectivity returned; nothing had ever
// asked it.
//
// THE §17.7 STORAGE VERDICT IS PUBLISHED, not logged. `checkLocalDbLimit` returns it and its only
// other output is a console.warn, which nobody on a site can see.
//
// THE PROJECT PICKER IS MOUNTED PER ROLE, and the list is a product decision that has been amended
// twice — SITE_ENGINEER on 2026-08-12, SAFETY_OFFICER on 2026-08-13 — each time because the role's
// screens read `projectStore` and rendered nothing without an answer. The managers still pick per
// screen. Mounting it for everyone would invent a flow no drawing asks for; mounting it for too few
// leaves a role's Active Project bar simply absent.

import { render, waitFor } from '@testing-library/react-native';
import { CosRole } from '@cos/types';
import { useAuthStore } from '../../../store/authStore';
import { useOfflineStore } from '../../../store/offlineStore';
import { useProjectStore } from '../../../store/projectStore';
import AppLayout from '../_layout';

let mockOnline = true;
jest.mock('../../../hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: mockOnline, connectionType: null }),
}));

jest.mock('expo-router', () => ({ usePathname: () => '/home' }));

jest.mock('../../../sync/syncRunner', () => ({ runSyncCycle: jest.fn(() => Promise.resolve()) }));
jest.mock('../../../db/database', () => ({
  ...jest.requireActual('../../../db/database'),
  checkLocalDbLimit: jest.fn(() => 'OK'),
}));

// The shell's four children each have their own spec; what this file is about is the shell.
jest.mock('../../../components/TopBar', () => ({ TopBar: () => null }));
jest.mock('../../../components/Breadcrumb', () => ({ Breadcrumb: () => null }));
jest.mock('../../../components/MobileNav', () => ({ MobileNav: () => null }));
jest.mock('../../../components/NavigationDrawer', () => ({ NavigationDrawer: () => null }));
jest.mock('../../../components/SelectProjectSheet', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native') as typeof import('react-native');
  return { SelectProjectSheet: () => <View testID="select-project-sheet" /> };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sync = require('../../../sync/syncRunner') as { runSyncCycle: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const db = require('../../../db/database') as { checkLocalDbLimit: jest.Mock };

function renderShell() {
  return render(<AppLayout />);
}

describe('AppLayout', () => {
  let hydrate: jest.Mock;

  beforeEach(() => {
    mockOnline = true;
    hydrate = jest.fn(() => Promise.resolve());
    sync.runSyncCycle.mockReset();
    sync.runSyncCycle.mockResolvedValue(undefined);
    db.checkLocalDbLimit.mockReset();
    db.checkLocalDbLimit.mockReturnValue('OK');
    useAuthStore.setState({ role: CosRole.PROJECT_MANAGER } as never);
    useProjectStore.setState({ hydrate, active: null } as never);
    useOfflineStore.setState({ localDbStatus: 'OK' } as never);
  });

  // Until the remembered site has been read back, `active` is null — and a guard that fired on that
  // would bounce a worker who had already chosen into the picker on every cold start.
  it('reads the remembered site back once', async () => {
    await renderShell();

    await waitFor(() => expect(hydrate).toHaveBeenCalledTimes(1));
  });

  it('syncs on entering the app', async () => {
    await renderShell();

    await waitFor(() => expect(sync.runSyncCycle).toHaveBeenCalledTimes(1));
  });

  // THE REASON THE EFFECT KEYS ON isOnline. Offline it must not try.
  it('does not sync while there is no signal', async () => {
    mockOnline = false;

    await renderShell();

    await waitFor(() => expect(hydrate).toHaveBeenCalled());
    expect(sync.runSyncCycle).not.toHaveBeenCalled();
  });

  // A morning of reports must not wait for the worker to leave the app group and come back.
  it('syncs again the moment the signal returns', async () => {
    mockOnline = false;

    const { rerender } = await renderShell();
    await waitFor(() => expect(hydrate).toHaveBeenCalled());
    expect(sync.runSyncCycle).not.toHaveBeenCalled();

    mockOnline = true;
    await rerender(<AppLayout />);

    await waitFor(() => expect(sync.runSyncCycle).toHaveBeenCalledTimes(1));
  });

  // PUBLISHED, not logged: a console.warn is invisible on a site handset.
  it('publishes the storage verdict where the app can read it', async () => {
    db.checkLocalDbLimit.mockReturnValue('WARN');

    await renderShell();

    await waitFor(() => expect(useOfflineStore.getState().localDbStatus).toBe('WARN'));
  });

  // AFTER the cycle, not before it: the pull is what grows the cache, so a verdict taken first would
  // describe the size before the thing that changed it.
  //
  // This is also why the `void …finally()` here is safe where the same shape was a live defect at
  // the root layout and on the biometric toggle: `runSyncCycle` NEVER REJECTS — both of its awaits
  // are wrapped and the outcome is reported through the store, so the promise `.finally()` returns
  // has nothing to reject with.
  it('publishes the verdict only once the cycle has finished', async () => {
    let finish: () => void = () => undefined;
    sync.runSyncCycle.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    db.checkLocalDbLimit.mockReturnValue('FULL');

    await renderShell();

    await waitFor(() => expect(sync.runSyncCycle).toHaveBeenCalled());
    expect(db.checkLocalDbLimit).not.toHaveBeenCalled();

    finish();
    await waitFor(() => expect(useOfflineStore.getState().localDbStatus).toBe('FULL'));
  });

  // The three field roles answer the site question up front; the managers pick per screen.
  it.each([CosRole.SITE_WORKER, CosRole.SITE_ENGINEER, CosRole.SAFETY_OFFICER])(
    'mounts the project picker for %s',
    async (role) => {
      useAuthStore.setState({ role } as never);

      const { getByTestId } = await renderShell();

      expect(getByTestId('select-project-sheet')).toBeTruthy();
    },
  );

  it.each([CosRole.PROJECT_MANAGER, CosRole.TENANT_ADMIN, CosRole.FINANCE])(
    'does not mount it for %s, who picks per screen',
    async (role) => {
      useAuthStore.setState({ role } as never);

      const { queryByTestId } = await renderShell();

      expect(queryByTestId('select-project-sheet')).toBeNull();
    },
  );

  it('does not mount it for a session whose role has not arrived', async () => {
    useAuthStore.setState({ role: null } as never);

    const { queryByTestId } = await renderShell();

    expect(queryByTestId('select-project-sheet')).toBeNull();
  });
});
