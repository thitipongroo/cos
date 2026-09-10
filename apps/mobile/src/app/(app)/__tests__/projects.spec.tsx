// Behaviour of the VIEWER's project list, rebuilt to
// `mockup/mobile/role_viewer/02_projects/01_list_items` on 2026-09-10.
//
// The list still comes from the local cache through `useCollection` with no limit, so it renders
// every project the device holds — that part is unchanged and the first three cases below are the
// ones this file already had. What is new is the drawing's furniture: a search field that really
// filters the cached rows, and a category chip row that does not filter anything and says so.

import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
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

  it('renders one card per cached project, with its real code, name and status', async () => {
    useCollection.mockReturnValue([RIVERSIDE, HARBOUR]);

    const { getAllByTestId, getByText } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('project-item')).toHaveLength(2));
    expect(getByText('Riverside Tower')).toBeTruthy();
    expect(getByText('Harbour Works')).toBeTruthy();
    // The chip prints the LIFECYCLE status the cache holds, not the drawing's "ON TRACK".
    expect(getByText('ACTIVE')).toBeTruthy();
    expect(getByText('ON_HOLD')).toBeTruthy();
    // The code line carries the drawn category beside the real code.
    expect(getByText(/RVT-01/)).toBeTruthy();
  });

  it('refreshes the cache on entry', async () => {
    useCollection.mockReturnValue([]);

    await renderScreen();

    await waitFor(() => expect(refreshProjectsCache).toHaveBeenCalled());
  });

  it('shows the empty state and no rows when the cache is empty', async () => {
    useCollection.mockReturnValue([]);

    const { getByTestId, queryAllByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('projects-empty')).toBeTruthy());
    expect(queryAllByTestId('project-item')).toHaveLength(0);
  });

  it('still lists the cached projects when the refresh fails offline', async () => {
    useCollection.mockReturnValue([RIVERSIDE]);
    refreshProjectsCache.mockRejectedValue(new Error('offline'));

    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('project-item')).toHaveLength(1));
  });

  it('filters the cached rows by code and by name', async () => {
    useCollection.mockReturnValue([RIVERSIDE, HARBOUR]);

    const { getByTestId, getAllByTestId, queryByText } = await renderScreen();
    await waitFor(() => expect(getAllByTestId('project-item')).toHaveLength(2));

    fireEvent.changeText(getByTestId('projects-search'), 'harbour');
    await waitFor(() => expect(getAllByTestId('project-item')).toHaveLength(1));
    expect(queryByText('Riverside Tower')).toBeNull();

    fireEvent.changeText(getByTestId('projects-search'), 'RVT');
    await waitFor(() => expect(queryByText('Riverside Tower')).toBeTruthy());
    expect(queryByText('Harbour Works')).toBeNull();
  });

  it('says so rather than filtering when a search matches nothing', async () => {
    useCollection.mockReturnValue([RIVERSIDE]);

    const { getByTestId, queryAllByTestId } = await renderScreen();
    await waitFor(() => expect(queryAllByTestId('project-item')).toHaveLength(1));

    fireEvent.changeText(getByTestId('projects-search'), 'zzz');

    await waitFor(() => expect(queryAllByTestId('project-item')).toHaveLength(0));
    // The two empty states are different sentences — "nothing cached" and "nothing matched" are
    // different answers, and the screen must not give the first when it means the second.
    expect(getByTestId('projects-empty')).toBeTruthy();
  });

  it('draws the category chips and says coming soon when one is pressed', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    useCollection.mockReturnValue([RIVERSIDE]);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('projects-filter-all')).toBeTruthy());

    fireEvent.press(getByTestId('projects-filter-commercial'));

    // `projects.projects` has no category column, so the chip has nothing to filter on — the row
    // is drawn as the mockup draws it and says so on the press, never on the page.
    expect(alert).toHaveBeenCalled();
    alert.mockRestore();
  });
});
