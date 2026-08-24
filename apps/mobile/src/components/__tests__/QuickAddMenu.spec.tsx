// Behaviour of the Tenant Admin's Quick Commands overlay.
//
// EVERY TILE IS REAL OR IT IS A DASH ("ถ้าไม่รู้ ห้ามเดา"). The mockup prints "98.4 %" system health
// and a "94 % CONFIDENCE / Source" line on the AI card; neither figure exists anywhere in this
// platform. What replaced them is what the platform can actually answer — a liveness ping shown as a
// WORD, and a project count from `GET /projects/mine` — and where it can answer nothing, an em dash.
//
// THREE ACTIONS CLOSE BEFORE THEY NAVIGATE, and the order is asserted rather than the outcome. This
// is a full-screen MODAL; left mounted over the screen it just opened, it swallows the first tap on
// that screen and `onRequestClose` pops the wrong thing. A test that only checked "did it navigate"
// would pass on exactly that bug.
//
// FORCE SYNC IS THE ONE REAL ACTION, and it goes through `runSyncCycle` — the SAME single entry point
// the shell, the reconnect listener and the background job use, so a manual sync joins an in-flight
// cycle rather than starting a second one against the same queue. It stays open while it runs,
// because closing the sheet would take away the only place its progress is shown.
//
// AND THE AI REPORT CARD IS AN HONEST PLACEHOLDER: there is no AI-report screen, so it says so
// rather than routing somewhere approximate.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { I18nProvider } from '../../i18n';
import { QuickAddMenu } from '../QuickAddMenu';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

const mockRunSyncCycle = jest.fn();
jest.mock('../../sync/syncRunner', () => ({ runSyncCycle: () => mockRunSyncCycle() }));

jest.mock('../../api/projects', () => ({ getMyProjects: jest.fn() }));
jest.mock('../../api/health', () => ({ checkBackendHealth: jest.fn() }));
jest.mock('../../hooks/useSyncStatus', () => ({ useSyncStatus: () => 'idle' }));
jest.mock('../../hooks/usePendingCount', () => ({ usePendingCount: () => 0 }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const projects = require('../../api/projects') as { getMyProjects: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const health = require('../../api/health') as { checkBackendHealth: jest.Mock };

function renderMenu(props: Record<string, unknown> = {}) {
  const onClose = jest.fn();
  const utils = render(
    <I18nProvider>
      <QuickAddMenu visible onClose={onClose} {...props} />
    </I18nProvider>,
  );
  return { onClose, utils };
}

describe('QuickAddMenu', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    mockPush.mockReset();
    mockRunSyncCycle.mockReset().mockResolvedValue(undefined);
    projects.getMyProjects.mockReset().mockResolvedValue([{ project_id: 'p-1' }]);
    health.checkBackendHealth.mockReset().mockResolvedValue(true);
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => alert.mockRestore());

  it('draws nothing while it is closed', async () => {
    const { utils } = renderMenu({ visible: false });
    const { queryByTestId } = await utils;

    expect(queryByTestId('quick-add-menu')).toBeNull();
  });

  it('offers the five commands', async () => {
    const { utils } = renderMenu();
    const { getByTestId } = await utils;

    expect(getByTestId('quick-add-invite')).toBeTruthy();
    expect(getByTestId('quick-add-integration')).toBeTruthy();
    expect(getByTestId('quick-add-apps')).toBeTruthy();
    expect(getByTestId('quick-add-report')).toBeTruthy();
    expect(getByTestId('quick-add-sync')).toBeTruthy();
  });

  // ── THE THREE THAT NAVIGATE ──────────────────────────────────────────────────────────────────

  it.each([
    ['quick-add-invite', '/invite-user'],
    ['quick-add-integration', '/system-integration'],
    ['quick-add-apps', '/apps-services'],
  ])('sends %s to %s', async (testID, route) => {
    const { utils } = renderMenu();
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId(testID));

    expect(mockPush).toHaveBeenCalledWith(route);
  });

  // ORDER, not just outcome: a modal left over the screen it opened swallows the first tap on it.
  it.each(['quick-add-invite', 'quick-add-integration', 'quick-add-apps'])(
    'closes before %s navigates',
    async (testID) => {
      const { onClose, utils } = renderMenu();
      const { getByTestId } = await utils;

      await fireEvent.press(getByTestId(testID));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onClose.mock.invocationCallOrder[0]).toBeLessThan(
        mockPush.mock.invocationCallOrder[0]!,
      );
    },
  );

  it('closes on the close control without navigating anywhere', async () => {
    const { onClose, utils } = renderMenu();
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId('quick-add-close'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  // ── FORCE SYNC ───────────────────────────────────────────────────────────────────────────────

  it('runs a real sync cycle', async () => {
    const { utils } = renderMenu();
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId('quick-add-sync'));

    await waitFor(() => expect(mockRunSyncCycle).toHaveBeenCalledTimes(1));
  });

  // The sheet STAYS OPEN: it is the only place the sync's progress is shown, and closing it would
  // take the feedback away at the moment it starts.
  it('stays open while the sync runs', async () => {
    const { onClose, utils } = renderMenu();
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId('quick-add-sync'));

    await waitFor(() => expect(mockRunSyncCycle).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  // A second Force Sync on top of the first is not a faster sync — it is two writers on one queue.
  // (`runSyncCycle` joins an in-flight cycle, and this guard means it is never asked to.)
  it('refuses a second sync while one is in flight', async () => {
    mockRunSyncCycle.mockReturnValue(new Promise(() => undefined));

    const { utils } = renderMenu();
    const { getByTestId } = await utils;

    void fireEvent.press(getByTestId('quick-add-sync'));
    await waitFor(() => expect(mockRunSyncCycle).toHaveBeenCalledTimes(1));

    expect(getByTestId('quick-add-sync').props.accessibilityState.disabled).toBe(true);

    void fireEvent.press(getByTestId('quick-add-sync'));

    expect(mockRunSyncCycle).toHaveBeenCalledTimes(1);
  });

  it('is offerable again once the sync finishes', async () => {
    const { utils } = renderMenu();
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId('quick-add-sync'));

    await waitFor(() =>
      expect(getByTestId('quick-add-sync').props.accessibilityState.disabled).toBe(false),
    );
  });

  // ── THE ONE THAT GOES NOWHERE, AND SAYS SO ───────────────────────────────────────────────────

  // No AI-report screen exists. The card keeps the mockup's layout and drops its fabricated
  // "94 % CONFIDENCE / Source" line — no such signal exists to print.
  it('says the AI report is not built rather than routing somewhere near it', async () => {
    const { onClose, utils } = renderMenu();
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId('quick-add-report'));

    expect(alert).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('prints no confidence figure on the AI card', async () => {
    const { utils } = renderMenu();
    const { queryByText } = await utils;

    expect(queryByText(/CONFIDENCE/i)).toBeNull();
    expect(queryByText(/94/)).toBeNull();
  });

  // ── THE TWO REAL FIGURES ─────────────────────────────────────────────────────────────────────

  it('counts the active projects from the real list', async () => {
    projects.getMyProjects.mockResolvedValue([
      { project_id: 'p-1' },
      { project_id: 'p-2' },
      { project_id: 'p-3' },
    ]);

    const { utils } = renderMenu();
    const { getByText } = await utils;

    await waitFor(() => expect(getByText('3')).toBeTruthy());
  });

  // An honest dash beats a fabricated number, on the tile a tenant administrator reads as the size
  // of their estate.
  it('shows a dash when the project count cannot be fetched', async () => {
    projects.getMyProjects.mockRejectedValue(new Error('offline'));

    const { utils } = renderMenu();
    const { getAllByText } = await utils;

    await waitFor(() => expect(getAllByText('—').length).toBeGreaterThan(0));
  });

  // A WORD, never the mockup's "98.4 %": a liveness ping answers yes or no, and a percentage would
  // be a precision the check does not have.
  it('reports system health as a word the ping can support', async () => {
    health.checkBackendHealth.mockResolvedValue(true);

    const { utils } = renderMenu();
    const { queryByText } = await utils;

    await waitFor(() => expect(projects.getMyProjects).toHaveBeenCalled());
    expect(queryByText(/98\.4/)).toBeNull();
    expect(queryByText('%')).toBeNull();
  });

  it('says so when the system is down', async () => {
    health.checkBackendHealth.mockResolvedValue(false);

    const { utils } = renderMenu();
    const { getByText } = await utils;

    await waitFor(() => expect(getByText('Degraded')).toBeTruthy());
  });

  // A ping that THREW leaves the state unknown rather than asserting either answer — this tile is
  // where an administrator decides whether to escalate.
  it('claims nothing when the ping itself failed', async () => {
    health.checkBackendHealth.mockRejectedValue(new Error('ECONNREFUSED'));

    const { utils } = renderMenu();
    const { queryByText } = await utils;

    await waitFor(() => expect(health.checkBackendHealth).toHaveBeenCalled());
    expect(queryByText('Degraded')).toBeNull();
  });

  // The figures load when the overlay OPENS, not on mount: this sits inside a Home that is always
  // mounted, so fetching on mount would spend two requests on a sheet nobody opened.
  it('asks for nothing while it is closed', async () => {
    renderMenu({ visible: false });

    expect(projects.getMyProjects).not.toHaveBeenCalled();
    expect(health.checkBackendHealth).not.toHaveBeenCalled();
  });

  // The overlay replaces the app bar while it is up, so it carries its own sync pill.
  it('carries its own sync pill', async () => {
    const { utils } = renderMenu();
    const { getByTestId } = await utils;

    expect(getByTestId('quick-add-sync-pill')).toBeTruthy();
  });
});
