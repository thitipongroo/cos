// The VIEWER Home dashboard (mockup/mobile/role_viewer/01_home/01_dashboard).
//
// What is worth pinning here is the LINE BETWEEN REAL AND DRAWN, because it is invisible on screen:
// the project count and the project cards come from the offline cache, and the two tiles beside
// them do not — a later edit that swapped either way would render perfectly. The other half is the
// three-valued project state (loading, ready-and-empty, failed), which PmHome shipped wrong once
// and had photographed.
//
// THE ISSUE TILE TOOK TWO WRONG ANSWERS. It counted `local_issues` and printed a confident 0 for a
// role whose device never fills that table, then fetched `GET /site/issues` and drew an em dash for
// a measured 403. It is a registered figure now (VIEWER_OPEN_ISSUES), and the assertion below is
// that it never silently becomes a zero again.

import { render, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import ViewerHome from '../ViewerHome';
import {
  VIEWER_PORTFOLIO_BUDGET,
  VIEWER_HOME_PROJECT_CARDS,
  VIEWER_OPEN_ISSUES,
} from '../../../lib/mockupFigures';

jest.mock('../../../hooks/useCollection', () => ({ useCollection: jest.fn(() => []) }));
jest.mock('../../../api/projects', () => ({
  refreshProjectsCache: jest.fn(async () => undefined),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useCollection } = require('../../../hooks/useCollection') as { useCollection: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { refreshProjectsCache } = require('../../../api/projects') as {
  refreshProjectsCache: jest.Mock;
};

const PROJECT = {
  id: 'p-1',
  projectId: 'proj-1',
  projectCode: 'RVT-01',
  projectName: 'Riverside Tower',
  status: 'ACTIVE',
};
const SECOND = { ...PROJECT, id: 'p-2', projectCode: 'HBR-02', projectName: 'Harbour Works' };
const THIRD = { ...PROJECT, id: 'p-3', projectCode: 'APX-03', projectName: 'Apex Yard' };

/** The projects the offline cache holds. Everything else on this screen is drawn. */
function withData(projects: unknown[]): void {
  useCollection.mockImplementation(() => projects);
}

function renderHome() {
  return render(
    <I18nProvider>
      <ViewerHome />
    </I18nProvider>,
  );
}

describe('ViewerHome', () => {
  beforeEach(() => {
    useCollection.mockReset();
    refreshProjectsCache.mockReset();
    refreshProjectsCache.mockResolvedValue(undefined);
  });

  it('counts the cached projects, and draws the issue figure it cannot fetch', async () => {
    withData([PROJECT, SECOND]);

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('viewer-kpi-projects')).toBeTruthy());
    // REAL: two cached projects.
    expect(getByTestId('viewer-kpi-projects')).toHaveTextContent(/2/);
    // DRAWN: `GET /site/issues` answers 403 for this role, measured 2026-09-10.
    expect(getByTestId('viewer-kpi-issues')).toHaveTextContent(
      new RegExp(String(VIEWER_OPEN_ISSUES.value)),
    );
  });

  it('never prints a zero on the issue tile, which is how it was wrong the first time', async () => {
    withData([]);

    const { getByTestId } = await renderHome();

    // The tile counted `local_issues` for one build. That table is empty for this role and always
    // will be, so the tile stated "0 open issues" about a seeded portfolio. A zero here means the
    // count has been wired back to a source that cannot answer.
    await waitFor(() => expect(getByTestId('viewer-kpi-issues')).toBeTruthy());
    expect(getByTestId('viewer-kpi-issues')).not.toHaveTextContent(/\b0\b/);
  });

  it('prints the drawn portfolio budget, which no cache can answer', async () => {
    withData([PROJECT]);

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('viewer-kpi-budget')).toBeTruthy());
    expect(getByTestId('viewer-kpi-budget')).toHaveTextContent(
      new RegExp(VIEWER_PORTFOLIO_BUDGET.value.total.replace(/[$.]/g, '\\$&')),
    );
  });

  it('lists at most as many project cards as the register has figures for', async () => {
    withData([PROJECT, SECOND, THIRD]);

    const { queryByTestId } = await renderHome();

    await waitFor(() => expect(queryByTestId('viewer-project-p-1')).toBeTruthy());
    expect(queryByTestId('viewer-project-p-2')).toBeTruthy();
    // Three cached, two drawn — the third is not shown on Home; /projects lists them all.
    expect(VIEWER_HOME_PROJECT_CARDS.value).toHaveLength(2);
    expect(queryByTestId('viewer-project-p-3')).toBeNull();
  });

  it('prints the real lifecycle status on a card, not the drawing’s "On Track"', async () => {
    withData([{ ...PROJECT, status: 'ON_HOLD' }]);

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('viewer-project-p-1')).toBeTruthy());
    expect(getByTestId('viewer-project-p-1')).toHaveTextContent(/ON_HOLD/);
    expect(getByTestId('viewer-project-p-1')).not.toHaveTextContent(/On Track/);
  });

  it('says the portfolio is empty when the refresh succeeded and returned nothing', async () => {
    withData([]);

    const { getByTestId, queryByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('viewer-no-projects')).toBeTruthy());
    expect(queryByTestId('viewer-projects-failed')).toBeNull();
  });

  it('says the list did not load when the refresh failed with nothing cached', async () => {
    withData([]);
    refreshProjectsCache.mockRejectedValue(new Error('offline'));

    const { getByTestId, queryByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('viewer-projects-failed')).toBeTruthy());
    // The two sentences are different answers and must never both appear.
    expect(queryByTestId('viewer-no-projects')).toBeNull();
  });

  it('says nothing about a failure when the cache already answered', async () => {
    withData([PROJECT]);
    refreshProjectsCache.mockRejectedValue(new Error('offline'));

    const { queryByTestId, getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('viewer-project-p-1')).toBeTruthy());
    // Offline over a warm cache is the ordinary case (§17.4), not something to report.
    expect(queryByTestId('viewer-projects-failed')).toBeNull();
  });

  it('foots the AI card with a record set this repository has, and no confidence', async () => {
    withData([PROJECT]);

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('viewer-insight')).toBeTruthy());
    // ADR-098 amendment 2: the source names something this repo HAS. The drawing foots nothing on
    // this card, and the card makes no confidence claim, so no CONF half is drawn.
    expect(getByTestId('viewer-insight-foot')).toHaveTextContent(/assigned projects/i);
    expect(getByTestId('viewer-insight-foot')).not.toHaveTextContent(/CONF/);
  });
});
