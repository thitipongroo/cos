// Behaviour of the project manager's More tab.
//
// Half the tiles here have no screen behind them. The rule is the same one the apps catalogue and
// the transparency portal follow: the tile still renders and TAPPING IT SAYS SO. A tile that does
// nothing reads as the app being broken rather than the feature being unbuilt.
//
// One tile has a history worth a test. Cost analysis points at THIS role's `/finance`, not at
// `/budget`. It pointed at `/budget` while the manager had no finance screen of their own — and
// `/budget` is a FINANCE / VIEWER tab, so a manager pushed into it arrived on a screen with no
// breadcrumb (therefore no TopBar Back) and no tab of their own to leave by. That is a dead end, and
// the kind a route constant drifts back into.
//
// The insight panel is best-effort: offline it stays on its idle line rather than claiming a project.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
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
// The insight panel calls the analytics endpoint on its own; it is not what this tab's rules are.
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

describe('MoreScreen', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    mockPush.mockReset();
    api.getMyProjects.mockReset();
    api.getMyProjects.mockResolvedValue([
      { project_id: 'p-1', project_name: 'Riverside Tower', project_code: 'PRJ-1' },
    ]);
    useAuthStore.setState({
      displayName: 'Waraporn Klinhom',
      role: CosRole.PROJECT_MANAGER,
    } as never);
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => alert.mockRestore());

  it('shows who is signed in', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('more-profile')).toBeTruthy());
  });

  it('renders all six tiles', async () => {
    const { getByTestId } = await renderScreen();

    for (const id of ['projectSettings', 'team', 'documents', 'cost', 'contractors', 'siteMap']) {
      expect(getByTestId(`more-${id}`)).toBeTruthy();
    }
  });

  // THE ROUTE WITH A HISTORY. `/budget` is another role's tab and a dead end for this one.
  it('sends cost analysis to this role`s own finance screen', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('more-cost'));

    expect(mockPush).toHaveBeenCalledWith('/finance');
    expect(mockPush).not.toHaveBeenCalledWith('/budget');
  });

  it('sends contractors to the vendor directory', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('more-contractors'));

    expect(mockPush).toHaveBeenCalledWith('/vendors');
  });

  // A tile that does nothing reads as the app being broken rather than the feature being unbuilt.
  it('says an unbuilt tile is unbuilt rather than navigating', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('more-projectSettings'));

    expect(alert).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('marks the unbuilt tiles before they are pressed', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    expect(getByTestId('more-projectSettings-soon')).toBeTruthy();
    expect(getByTestId('more-siteMap-soon')).toBeTruthy();
    // The two that lead somewhere carry no chip.
    expect(queryByTestId('more-cost-soon')).toBeNull();
    expect(queryByTestId('more-contractors-soon')).toBeNull();
  });

  // Best-effort: the panel stays on its idle line rather than claiming a project it does not have.
  it('stays usable when the project list cannot be fetched', async () => {
    api.getMyProjects.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('more-screen')).toBeTruthy());
    expect(getByTestId('more-cost')).toBeTruthy();
  });

  it('stays usable when the manager is on no projects', async () => {
    api.getMyProjects.mockResolvedValue([]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('more-screen')).toBeTruthy());
  });
});
