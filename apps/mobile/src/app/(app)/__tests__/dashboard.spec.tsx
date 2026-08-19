// Behaviour of the PM analytics dashboard, pinned before its day list is moved off ScrollView onto
// a FlatList.
//
// /analytics/pm/:projectId returns one row per event date and has no upper bound, so every day of a
// running project is rendered today. What must survive the change: the ?projectId= preselect, the
// picker driving the fetch, the four labelled KPIs per day, and the three states the screen can be
// in (prompt, empty-for-project, load error).

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import DashboardScreen from '../dashboard';

jest.mock('../../../api/client', () => ({ get: jest.fn() }));
jest.mock('../../../hooks/useCollection', () => ({ useCollection: jest.fn(() => []) }));
jest.mock('../../../api/projects', () => ({
  refreshProjectsCache: jest.fn(async () => undefined),
}));

const searchParams: { projectId?: string } = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => searchParams,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as { get: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useCollection } = require('../../../hooks/useCollection') as { useCollection: jest.Mock };

const DAY_ONE = {
  eventDate: '2026-08-18',
  manpowerTotal: 24,
  issueOpenCount: 3,
  inspectionFailCount: 1,
  reportCount: 2,
};

const DAY_TWO = {
  eventDate: '2026-08-19',
  manpowerTotal: 31,
  issueOpenCount: 0,
  inspectionFailCount: 0,
  reportCount: 1,
};

function renderScreen() {
  return render(
    <I18nProvider>
      <DashboardScreen />
    </I18nProvider>,
  );
}

describe('DashboardScreen', () => {
  beforeEach(() => {
    client.get.mockReset();
    useCollection.mockReturnValue([{ projectId: 'proj-1', projectCode: 'RVT-01' }]);
    delete searchParams.projectId;
  });

  it('asks the reader to pick a project before anything is fetched', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('project-picker')).toBeTruthy());
    expect(client.get).not.toHaveBeenCalled();
  });

  it('renders one card per event date once a project is picked', async () => {
    client.get.mockResolvedValue([DAY_ONE, DAY_TWO]);

    const { getByTestId, getAllByTestId } = await renderScreen();

    fireEvent.press(getByTestId('project-option-proj-1'));

    await waitFor(() => expect(getAllByTestId('kpi-day')).toHaveLength(2));
    expect(client.get).toHaveBeenCalledWith('/analytics/pm/proj-1');
  });

  it('shows every KPI the row carries, with its value', async () => {
    client.get.mockResolvedValue([DAY_ONE]);

    const { getByTestId, getByText } = await renderScreen();

    fireEvent.press(getByTestId('project-option-proj-1'));

    await waitFor(() => expect(getByTestId('kpi-list')).toBeTruthy());
    expect(getByText('24')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
    expect(getByText('1')).toBeTruthy();
    expect(getByText('2')).toBeTruthy();
  });

  it('preselects the project named by ?projectId= and fetches it', async () => {
    searchParams.projectId = 'proj-9';
    client.get.mockResolvedValue([DAY_ONE]);

    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(client.get).toHaveBeenCalledWith('/analytics/pm/proj-9'));
    expect(getAllByTestId('kpi-day')).toHaveLength(1);
  });

  it('reports a load failure instead of leaving the previous project on screen', async () => {
    client.get.mockRejectedValue(new Error('offline'));

    const { getByTestId, queryAllByTestId } = await renderScreen();

    fireEvent.press(getByTestId('project-option-proj-1'));

    await waitFor(() => expect(queryAllByTestId('kpi-day')).toHaveLength(0));
  });
});
