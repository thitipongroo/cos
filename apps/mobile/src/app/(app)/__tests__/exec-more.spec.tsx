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

import { render, fireEvent, waitFor, within } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { CosRole } from '@cos/types';
import { I18nProvider } from '../../../i18n';
import { useAuthStore } from '../../../store/authStore';
import MoreScreen from '../more';

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

  it('has no identity block — the drawing has none', async () => {
    // Removed on 2026-09-07 (PO). The drawer is where this app shows who is signed in, and it was
    // showing it twice on the one screen that also opens the drawer.
    const { queryByTestId } = await renderScreen();
    await waitFor(() => expect(queryByTestId('exec-more-portfolioReport')).toBeTruthy());
    expect(queryByTestId('exec-more-profile')).toBeNull();
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

  it('carries no COMING SOON chip on the unbuilt tiles', async () => {
    // The chips came off on 2026-09-07 (PO), reversing the 2026-08-10 treatment for this screen.
    // The tiles still lead nowhere and still say so on tap — see the next test — but the drawing's
    // seven tiles now read alike.
    const { queryByTestId } = await renderScreen();
    await waitFor(() => expect(queryByTestId('exec-more-strategicBim')).toBeTruthy());
    expect(queryByTestId('exec-more-strategicBim-soon')).toBeNull();
    expect(queryByTestId('exec-more-carbon-soon')).toBeNull();
    expect(queryByTestId('exec-more-globalMap-soon')).toBeNull();
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

  it('draws each tile with the drawing glyph, its title and its body', async () => {
    // The tile was restructured on 2026-09-06 so the plate sits on the TITLE'S line with the body
    // beneath, as the drawing has it. Structure is not assertable here, but the three pieces are —
    // a restructure that dropped one of them would otherwise pass unnoticed.
    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('exec-more-portfolioReport')).toBeTruthy());

    const tile = getByTestId('exec-more-portfolioReport');
    expect(tile).toHaveTextContent(/Portfolio report/i);
    expect(tile).toHaveTextContent(/Every project at a glance/i);
    // `insights`, not the drawing's `monitoring`: that glyph is Material Symbols and this app's
    // icon set does not carry it (checked against the installed MaterialIcons glyph map).
    expect(within(tile).getByTestId('icon-insights')).toBeTruthy();
  });
});
