// Behaviour of the executive risk feed, pinned before its row is memoized.
//
// /analytics/executive groups by project and carries no LIMIT, so this is one row per project in
// the tenant. Severity is DERIVED here rather than sent by the endpoint — over 100% utilisation is
// CRITICAL, the at-risk flag is HIGH, an overdue invoice is MEDIUM — and the feed is sorted by it
// (master 3097-3098). Both the mapping and the ordering are what a memoized row can silently
// detach from the project it describes.

import { render, waitFor, within } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import AlertsScreen from '../alerts';

jest.mock('../../../api/client', () => ({ get: jest.fn() }));
// The screen now asks WHICH projects before it asks for their figures: `/analytics/executive`
// returns nothing without `projectIds` (see api/analytics.ts), so the ids have to come from
// somewhere first and this is the call that supplies them.
jest.mock('../../../api/projects', () => ({
  ...jest.requireActual('../../../api/projects'),
  getMyProjects: jest.fn(),
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const client = require('../../../api/client') as { get: jest.Mock };
const projectsApi = require('../../../api/projects') as { getMyProjects: jest.Mock };
/* eslint-enable @typescript-eslint/no-require-imports */

/** The four projects the rows below belong to, in the shape `GET /projects/mine` answers. */
const MINE = ['proj-crit-1111', 'proj-high-2222', 'proj-med-3333', 'proj-low-4444'].map((id) => ({
  project_id: id,
  project_code: id.slice(0, 8),
  project_name: id,
}));

function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    projectId: 'proj-1111-aaaa',
    totalCommitted: '400000.0000',
    totalActual: '350000.0000',
    totalBudget: '1000000.0000',
    utilizationPct: 35,
    atRisk: 0,
    overdueInvoiceCount: 0,
    ...over,
  };
}

const OVERRUN = row({ projectId: 'proj-crit-1111', utilizationPct: 118 });
const FLAGGED = row({ projectId: 'proj-high-2222', atRisk: 1 });
const OVERDUE = row({ projectId: 'proj-med-3333', overdueInvoiceCount: 2 });
const CALM = row({ projectId: 'proj-low-4444' });

function renderScreen() {
  return render(
    <I18nProvider>
      <AlertsScreen />
    </I18nProvider>,
  );
}

describe('AlertsScreen', () => {
  beforeEach(() => {
    client.get.mockReset();
    projectsApi.getMyProjects.mockReset();
    projectsApi.getMyProjects.mockResolvedValue(MINE);
  });

  it('asks for the executive OWN projects by id, or the endpoint answers nothing', async () => {
    // THE DEFECT THIS GUARDS. Until 2026-09-05 this screen called `/analytics/executive` with no
    // parameters; the controller turns that into an empty array, the ClickHouse `project_id IN ()`
    // matches no row, and the feed came back empty against a working backend.
    client.get.mockResolvedValue([OVERRUN]);

    await renderScreen();

    await waitFor(() => expect(client.get).toHaveBeenCalled());
    const url = String(client.get.mock.calls[0]![0]);
    expect(url).toContain('/analytics/executive?');
    for (const project of MINE) expect(url).toContain(`projectIds=${project.project_id}`);
  });

  it('does not call analytics at all when the executive has no projects', async () => {
    projectsApi.getMyProjects.mockResolvedValue([]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('alerts-screen')).toBeTruthy());
    expect(client.get).not.toHaveBeenCalled();
  });

  it('renders one card per project the analytics endpoint returns', async () => {
    client.get.mockResolvedValue([OVERRUN, FLAGGED, OVERDUE, CALM]);

    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('alert-item')).toHaveLength(4));
  });

  it('orders the feed by derived severity, worst first', async () => {
    // Deliberately supplied in the wrong order — the screen is what sorts them.
    client.get.mockResolvedValue([CALM, OVERDUE, OVERRUN, FLAGGED]);

    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('alert-item')).toHaveLength(4));
    // The row prints the first 8 characters of its project id, which is what identifies it here.
    const cards = getAllByTestId('alert-item');
    const order = ['proj-cri', 'proj-hig', 'proj-med', 'proj-low'];
    order.forEach((prefix, i) => expect(within(cards[i]).getByText(prefix)).toBeTruthy());
  });

  it('keeps the screen usable when the request fails offline', async () => {
    client.get.mockImplementation(() => Promise.reject(new Error('offline')));

    const { getByTestId, queryAllByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('alerts-screen')).toBeTruthy());
    expect(queryAllByTestId('alert-item')).toHaveLength(0);
  });
});
