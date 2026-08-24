// Behaviour of the project list, pinned before its row is memoized.
//
// The list comes from the local cache through useCollection with no limit, so it renders every
// project the device holds. The row's title is a composed string (code · name) and the status chip
// is per project — the pair a row memoized on the wrong props shows mismatched.

import { render, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import ProjectsScreen from '../projects';

jest.mock('../../../hooks/useCollection', () => ({ useCollection: jest.fn(() => []) }));
jest.mock('../../../api/projects', () => ({
  refreshProjectsCache: jest.fn(async () => undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useCollection } = require('../../../hooks/useCollection') as { useCollection: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { refreshProjectsCache } = require('../../../api/projects') as {
  refreshProjectsCache: jest.Mock;
};

const RIVERSIDE = {
  id: 'p-1',
  projectId: 'proj-1',
  projectCode: 'RVT-01',
  projectName: 'Riverside Tower',
  status: 'ACTIVE',
};
const HARBOUR = {
  id: 'p-2',
  projectId: 'proj-2',
  projectCode: 'HBR-02',
  projectName: 'Harbour Works',
  status: 'ON_HOLD',
};

function renderScreen() {
  return render(
    <I18nProvider>
      <ProjectsScreen />
    </I18nProvider>,
  );
}

describe('ProjectsScreen', () => {
  beforeEach(() => {
    useCollection.mockReset();
    refreshProjectsCache.mockReset();
    refreshProjectsCache.mockResolvedValue(undefined);
  });

  it('renders one row per cached project', async () => {
    useCollection.mockReturnValue([RIVERSIDE, HARBOUR]);

    const { getAllByTestId, getByText } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('project-item')).toHaveLength(2));
    expect(getByText('RVT-01 · Riverside Tower')).toBeTruthy();
    expect(getByText('HBR-02 · Harbour Works')).toBeTruthy();
  });

  it('refreshes the cache on entry', async () => {
    useCollection.mockReturnValue([]);

    await renderScreen();

    await waitFor(() => expect(refreshProjectsCache).toHaveBeenCalled());
  });

  it('shows the empty state and no rows when the cache is empty', async () => {
    useCollection.mockReturnValue([]);

    const { getByTestId, queryAllByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('projects-screen')).toBeTruthy());
    expect(queryAllByTestId('project-item')).toHaveLength(0);
  });

  it('still lists the cached projects when the refresh fails offline', async () => {
    useCollection.mockReturnValue([RIVERSIDE]);
    refreshProjectsCache.mockRejectedValue(new Error('offline'));

    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('project-item')).toHaveLength(1));
  });
});
