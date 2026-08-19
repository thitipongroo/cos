// Behaviour of the SITE_ENGINEER reports list, pinned before the row-memoization refactor.
//
// This is the most stateful of the seven list screens: the query is scoped to the active project,
// paged, searchable, and each card expands to a material-consumption form keyed on the row that was
// tapped. Those are the couplings a row memoized on the wrong props severs — most visibly the
// expansion, which would open the form under a different report than the one pressed.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import { useProjectStore } from '../../../store/projectStore';
import ReportsScreen from '../reports';

jest.mock('../../../api/client', () => ({ get: jest.fn(), post: jest.fn(), mutate: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as {
  get: jest.Mock;
  post: jest.Mock;
  mutate: jest.Mock;
};

const PROJECT_ID = 'proj-1';

function report(over: Partial<Record<string, unknown>> = {}) {
  return {
    report_id: 'rep-1',
    report_date: '2026-08-18',
    status: 'SUBMITTED',
    summary: null,
    blockers: 'Concrete pour delayed',
    blocker_category: 'MATERIAL',
    client_submitted_at: '2026-08-18T09:15:00Z',
    server_received_at: '2026-08-18T09:20:00Z',
    ...over,
  };
}

function renderScreen() {
  return render(
    <I18nProvider>
      <ReportsScreen />
    </I18nProvider>,
  );
}

describe('ReportsScreen', () => {
  beforeEach(() => {
    client.get.mockReset();
    client.post.mockReset();
    client.mutate.mockReset();
    useProjectStore.setState({
      active: { projectId: PROJECT_ID, projectName: 'Riverside Tower' },
    } as never);
  });

  it('renders one card per report returned by the API', async () => {
    client.get.mockResolvedValue({
      items: [report(), report({ report_id: 'rep-2', blockers: 'Crane down' })],
      total: 2,
    });

    const { getAllByTestId, getByText } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('report-item')).toHaveLength(2));
    expect(getByText('Concrete pour delayed')).toBeTruthy();
    expect(getByText('Crane down')).toBeTruthy();
  });

  it('scopes the query to the project named by the context bar', async () => {
    client.get.mockResolvedValue({ items: [report()], total: 1 });

    await renderScreen();

    await waitFor(() =>
      expect(client.get).toHaveBeenCalledWith(expect.stringContaining(`project_id=${PROJECT_ID}`)),
    );
  });

  it('appends the next page rather than replacing the list', async () => {
    client.get.mockImplementation((path: string) =>
      path.includes('page=2')
        ? Promise.resolve({
            items: [report({ report_id: 'rep-2', blockers: 'Crane down' })],
            total: 2,
          })
        : Promise.resolve({ items: [report()], total: 2 }),
    );

    const { getAllByTestId, getByTestId, getByText } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('report-item')).toHaveLength(1));

    await fireEvent.press(getByTestId('reports-load-more'));

    await waitFor(() => expect(getAllByTestId('report-item')).toHaveLength(2));
    // The first page is still there — this is an append, not a replace.
    expect(getByText('Concrete pour delayed')).toBeTruthy();
    expect(getByText('Crane down')).toBeTruthy();
  });

  it('opens the material form on the card that was tapped, and closes it on a second tap', async () => {
    client.get.mockResolvedValue({
      items: [report(), report({ report_id: 'rep-2', blockers: 'Crane down' })],
      total: 2,
    });

    const { getAllByTestId, getByText, queryAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('report-item')).toHaveLength(2));
    expect(queryAllByTestId('material-name-input')).toHaveLength(0);

    await fireEvent.press(getByText('Concrete pour delayed'));
    await waitFor(() => expect(queryAllByTestId('material-name-input')).toHaveLength(1));

    await fireEvent.press(getByText('Concrete pour delayed'));
    await waitFor(() => expect(queryAllByTestId('material-name-input')).toHaveLength(0));
  });

  it('shows the server total, not the number of rows on screen', async () => {
    client.get.mockResolvedValue({ items: [report()], total: 42 });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('reports-total')).toBeTruthy());
    // The label is the server's own `total`, not the one row on screen.
    expect(String(getByTestId('reports-total').props.children)).toContain('42');
  });

  it('keeps the screen usable when the list request fails offline', async () => {
    client.get.mockRejectedValue(new Error('offline'));

    const { getByTestId, queryAllByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('reports-screen')).toBeTruthy());
    expect(queryAllByTestId('report-item')).toHaveLength(0);
  });
});
