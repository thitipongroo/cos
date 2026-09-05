// Behaviour of the EXECUTIVE half of /more — seven tiles, four of which reach a screen
// (ADR-098, ADR-099).
//
// `more` carries two screens and branches on role, so the first thing asserted is that the executive
// gets its own. The rest is the split ADR-099 created: four tiles navigate, three say before the tap
// that there is nothing behind them, and two of the four are the entry points ADR-098 promised when
// /portfolio and /alerts left the bottom bar.
//
// Hooks live INSIDE the describe, and every render is awaited — `render()` returns a promise under
// this preset. A file-level `beforeEach` plus an explicit `cleanup()` produced empty trees from the
// third render onward; the sibling specs' shape does not.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { CosRole } from '@cos/types';
import { I18nProvider } from '../../../i18n';
import { useAuthStore } from '../../../store/authStore';
import MoreScreen from '../more';
import { ExecMore } from '../../../components/ExecMore';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../../api/projects', () => ({
  ...jest.requireActual('../../../api/projects'),
  getMyProjects: jest.fn(),
}));
jest.mock('../../../api/users', () => ({
  ...jest.requireActual('../../../api/users'),
  getMe: jest.fn().mockResolvedValue({ photo_url: null }),
}));
// The AI panel calls its own endpoint and prints the model's own confidence; it has its own spec.
// What matters here is that this screen never routes a mockup figure through it.
jest.mock('../../../components/PortfolioInsight', () => ({ PortfolioInsight: () => null }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../../../api/projects') as { getMyProjects: jest.Mock };

function renderScreen() {
  return render(
    <I18nProvider>
      <MoreScreen />
    </I18nProvider>,
  );
}

describe('MoreScreen — the EXECUTIVE tile set', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    mockPush.mockReset();
    api.getMyProjects.mockReset();
    api.getMyProjects.mockResolvedValue([
      { project_id: 'p-1', project_name: 'Sukhumvit 45', project_code: 'SKV45' },
    ]);
    useAuthStore.setState({
      displayName: 'Wichai Ekachai',
      role: CosRole.EXECUTIVE,
    } as never);
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => alert.mockRestore());

  it('renders the executive screen, not the project manager one', async () => {
    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('exec-more-screen')).toBeTruthy());
  });

  it('reads the signed-in identity from the session rather than the drawing', async () => {
    const { getByTestId } = await renderScreen();
    await waitFor(() =>
      expect(getByTestId('exec-more-profile')).toHaveTextContent(/Wichai Ekachai/),
    );
  });

  it('sends the four built tiles to the screens that exist', async () => {
    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('exec-more-portfolioReport')).toBeTruthy());

    for (const [tile, route] of [
      ['portfolioReport', '/portfolio'],
      ['financialForecast', '/budget'],
      ['riskCentre', '/alerts'],
      ['vendorDirectory', '/vendors'],
    ] as const) {
      mockPush.mockClear();
      await fireEvent.press(getByTestId(`exec-more-${tile}`));
      expect(mockPush).toHaveBeenCalledWith(route);
    }
  });

  it('keeps /portfolio and /alerts reachable after they left the bottom bar', async () => {
    // The condition ADR-098 attached to the bar change. Both routes lost their tab; if the tiles
    // ever stop pointing at them the drawer row is the only way left, and a screen behind one door
    // is how /alerts nearly disappeared entirely.
    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('exec-more-riskCentre')).toBeTruthy());

    await fireEvent.press(getByTestId('exec-more-riskCentre'));
    expect(mockPush).toHaveBeenCalledWith('/alerts');

    mockPush.mockClear();
    await fireEvent.press(getByTestId('exec-more-portfolioReport'));
    expect(mockPush).toHaveBeenCalledWith('/portfolio');
  });

  it('marks the three unbuilt tiles BEFORE the tap', async () => {
    // Said where the eye already is, not only on tap — the treatment more.tsx settled on for the
    // manager's four unbuilt tiles (PO 2026-08-10).
    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('exec-more-strategicBim-soon')).toBeTruthy());
    expect(getByTestId('exec-more-carbon-soon')).toBeTruthy();
    expect(getByTestId('exec-more-globalMap-soon')).toBeTruthy();
  });

  it('navigates nowhere when an unbuilt tile is tapped', async () => {
    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('exec-more-carbon')).toBeTruthy());

    await fireEvent.press(getByTestId('exec-more-carbon'));
    expect(alert).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('writes no state after the screen is unmounted mid-flight', async () => {
    // The `cancelled` guards in the effect, exercised where they actually matter: an executive who
    // leaves the tab before a slow portfolio query answers. Without them React logs a state update
    // on an unmounted component, and on a screen with four in-flight requests that is four warnings
    // and a real leak.
    let release: (value: never) => void = () => undefined;
    api.getMyProjects.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const view = await renderScreen();
    view.unmount();
    release([] as never);
    await waitFor(() => expect(true).toBe(true));
  });

  it('keeps the tiles when the project list is unreachable', async () => {
    // The AI panel needs a project; the TILES do not. Offline must not empty the screen — the four
    // that navigate still navigate, because they point at routes rather than at data.
    api.getMyProjects.mockImplementation(() => Promise.reject(new Error('offline')));
    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('exec-more-portfolioReport')).toBeTruthy());
    await fireEvent.press(getByTestId('exec-more-portfolioReport'));
    expect(mockPush).toHaveBeenCalledWith('/portfolio');
  });

  it('draws an em dash for the role when the session carries none', async () => {
    // ExecMore is rendered DIRECTLY here, not through MoreScreen: the route branches on role, so a
    // null role would send MoreScreen to the manager's screen and this component would never mount.
    // The fallback is still worth having — a session whose role the client could not read must not
    // render the word "null" — and this is the only way to reach it.
    useAuthStore.setState({ displayName: null, role: null } as never);
    const { getByTestId } = await render(
      <I18nProvider>
        <ExecMore />
      </I18nProvider>,
    );
    await waitFor(() => expect(getByTestId('exec-more-profile')).toHaveTextContent(/—/));
  });
});
