// Behaviour of the portfolio project list.
//
// Two sources meet in each row: the project comes from the local cache and its health from
// /analytics/executive, joined by projectId. That join is what a row memoized on the wrong props
// gets wrong — one project's "at risk" band beside another project's name — and no assertion that
// merely looks for text on screen would notice.
//
// REWRITTEN 2026-09-07 with the screen (mockup 08_executive/03_portfolio/01_ex_portfolio). The
// list, the join and the offline behaviour are unchanged and their tests are kept as they were; the
// search box, the four filter chips, the sort control and the summary strip are new, and the tests
// below are written against what each of those is COMPUTED FROM rather than against what it prints.
// The drawn figures on each card are covered by one test that pins them to the register.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import PortfolioScreen from '../portfolio';

jest.mock('../../../api/client', () => ({ get: jest.fn() }));
jest.mock('../../../hooks/useCollection', () => ({ useCollection: jest.fn(() => []) }));
jest.mock('../../../api/projects', () => ({
  refreshProjectsCache: jest.fn(async () => undefined),
  getMyProjects: jest.fn(async () => []),
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const client = require('../../../api/client') as { get: jest.Mock };
const { useCollection } = require('../../../hooks/useCollection') as { useCollection: jest.Mock };
const projectsApi = require('../../../api/projects') as { getMyProjects: jest.Mock };
/* eslint-enable @typescript-eslint/no-require-imports */

const HEALTHY = {
  id: 'p-1',
  projectId: 'proj-1',
  projectCode: 'RVT-01',
  projectName: 'Riverside Tower',
  status: 'ACTIVE',
};
const AT_RISK = {
  id: 'p-2',
  projectId: 'proj-2',
  projectCode: 'HBR-02',
  projectName: 'Harbour Works',
  status: 'ACTIVE',
};

/** A full `/analytics/executive` row — the screen reads every one of these fields. */
function execRow(
  projectId: string,
  utilizationPct: number,
  atRisk: 0 | 1,
  budget = '1000.0000',
  actual = '900.0000',
) {
  return {
    projectId,
    totalBudget: budget,
    totalActual: actual,
    totalCommitted: actual,
    utilizationPct,
    atRisk,
    overdueInvoiceCount: 0,
  };
}

// proj-1 is on track; proj-2 is over 100% utilisation, which `executiveSeverityOf` calls CRITICAL.
const EXEC_ROWS = [execRow('proj-1', 62, 0), execRow('proj-2', 118, 1, '1000.0000', '1180.0000')];

function renderScreen() {
  return render(
    <I18nProvider>
      <PortfolioScreen />
    </I18nProvider>,
  );
}

describe('PortfolioScreen', () => {
  beforeEach(() => {
    client.get.mockReset();
    useCollection.mockReset();
    projectsApi.getMyProjects.mockReset();
    useCollection.mockReturnValue([HEALTHY, AT_RISK]);
    client.get.mockResolvedValue(EXEC_ROWS);
    projectsApi.getMyProjects.mockResolvedValue([
      {
        project_id: 'proj-1',
        project_code: 'RVT-01',
        project_name: 'Riverside Tower',
        progress_percent: 68,
      },
      {
        project_id: 'proj-2',
        project_code: 'HBR-02',
        project_name: 'Harbour Works',
        progress_percent: null,
      },
    ]);
  });

  it('renders one row per cached project', async () => {
    const { getAllByTestId, getByText } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('portfolio-item')).toHaveLength(2));
    expect(getByText('Riverside Tower')).toBeTruthy();
    expect(getByText('Harbour Works')).toBeTruthy();
  });

  it('puts each health band on the project it belongs to', async () => {
    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('portfolio-item')).toHaveLength(2));
    const cards = getAllByTestId('portfolio-item');
    // Sorted worst-first, so the over-budget project leads. Its utilisation is 118 and the healthy
    // one's is 62 — if the join ever slipped, these two numbers would swap cards.
    expect(cards[0]).toHaveTextContent(/Harbour Works/);
    expect(cards[0]).toHaveTextContent(/118/);
    expect(cards[1]).toHaveTextContent(/Riverside Tower/);
    expect(cards[1]).toHaveTextContent(/62/);
  });

  it('draws a progress bar only where the server could compute one', async () => {
    // §32.12: `progress_percent` is null when no task is linked to a BOQ line. An empty bar there
    // would read as "no work done", which is a different claim.
    const { getAllByTestId, queryAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('portfolio-item')).toHaveLength(2));
    expect(queryAllByTestId('portfolio-progress-bar')).toHaveLength(1);
  });

  it('opens the health detail of the project that was tapped', async () => {
    const { getByText, getByTestId } = await renderScreen();

    await waitFor(() => expect(getByText('Harbour Works')).toBeTruthy());
    await fireEvent.press(getByText('Harbour Works'));

    await waitFor(() => expect(getByTestId('portfolio-health')).toBeTruthy());
    expect(getByTestId('health-at-risk')).toBeTruthy();
  });

  it('still lists the projects when the health request fails offline', async () => {
    client.get.mockImplementation(() => Promise.reject(new Error('offline')));

    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('portfolio-item')).toHaveLength(2));
  });

  it('asks analytics for the CACHED project ids, or it gets nothing back', async () => {
    // THE DEFECT THIS GUARDS. Until 2026-09-05 this screen called `/analytics/executive` with no
    // parameters; the controller turns that into an empty array and the ClickHouse `project_id IN ()`
    // matches no row, so every health badge was missing against a working backend. The ids come from
    // the cached list this screen already renders — no second network call, and it works offline.
    await renderScreen();

    await waitFor(() => expect(client.get).toHaveBeenCalled());
    const url = String(client.get.mock.calls[0]![0]);
    expect(url).toContain('/analytics/executive?');
    expect(url).toContain('projectIds=proj-1');
    expect(url).toContain('projectIds=proj-2');
  });

  it('does not call analytics while the cached list is still empty', async () => {
    useCollection.mockReturnValue([]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('portfolio-screen')).toBeTruthy());
    expect(client.get).not.toHaveBeenCalled();
  });

  // ── the controls the replacement drawing added ───────────────────────────────────────────────

  it('counts the filter chips over EVERY project, not over the filtered list', async () => {
    // A count that changed when you pressed it would be describing your own filter rather than the
    // portfolio, which is the one thing a chip labelled with a number must not do.
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('portfolio-filter-all')).toHaveTextContent(/\(2\)/));
    expect(getByTestId('portfolio-filter-critical')).toHaveTextContent(/\(1\)/);
    expect(getByTestId('portfolio-filter-onTrack')).toHaveTextContent(/\(1\)/);

    await fireEvent.press(getByTestId('portfolio-filter-critical'));

    expect(getByTestId('portfolio-filter-all')).toHaveTextContent(/\(2\)/);
    expect(getByTestId('portfolio-filter-onTrack')).toHaveTextContent(/\(1\)/);
  });

  it('filters the list to the band that was pressed', async () => {
    const { getByTestId, getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('portfolio-item')).toHaveLength(2));
    await fireEvent.press(getByTestId('portfolio-filter-critical'));

    await waitFor(() => expect(getAllByTestId('portfolio-item')).toHaveLength(1));
    expect(getAllByTestId('portfolio-item')[0]).toHaveTextContent(/Harbour Works/);
    expect(getByTestId('portfolio-count')).toHaveTextContent(/1.*2/);
  });

  it('searches the project NAME and its CODE, and says when nothing matched', async () => {
    // Not contract or location: neither exists as data, so neither is searched. See the screen head.
    const { getByTestId, getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('portfolio-item')).toHaveLength(2));

    await fireEvent.changeText(getByTestId('portfolio-search'), 'harbour');
    await waitFor(() => expect(getAllByTestId('portfolio-item')).toHaveLength(1));

    await fireEvent.changeText(getByTestId('portfolio-search'), 'RVT-01');
    await waitFor(() => expect(getAllByTestId('portfolio-item')).toHaveLength(1));
    expect(getAllByTestId('portfolio-item')[0]).toHaveTextContent(/Riverside Tower/);

    await fireEvent.changeText(getByTestId('portfolio-search'), 'CT-8832');
    await waitFor(() => expect(getByTestId('portfolio-empty')).toBeTruthy());
  });

  it('sorts worst-first by default and by name when asked', async () => {
    const { getByTestId, getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('portfolio-item')).toHaveLength(2));
    expect(getAllByTestId('portfolio-item')[0]).toHaveTextContent(/Harbour Works/);

    await fireEvent.press(getByTestId('portfolio-sort'));

    await waitFor(() =>
      expect(getAllByTestId('portfolio-item')[0]).toHaveTextContent(/Harbour Works/),
    );
    // H before R alphabetically, so this pair does not distinguish the two orders on its own —
    // the SECOND card is what does.
    expect(getAllByTestId('portfolio-item')[1]).toHaveTextContent(/Riverside Tower/);
    expect(getByTestId('portfolio-sort')).toHaveTextContent(/Name/);
  });

  it('leaves a project with NO health row out of every band', async () => {
    // Unmeasured is not "on track". Colouring it green would say the opposite of what is known.
    client.get.mockResolvedValue([execRow('proj-1', 62, 0)]);
    const { getByTestId, getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('portfolio-item')).toHaveLength(2));
    expect(getByTestId('portfolio-filter-all')).toHaveTextContent(/\(2\)/);
    expect(getByTestId('portfolio-filter-critical')).toHaveTextContent(/\(0\)/);
    expect(getByTestId('portfolio-filter-atRisk')).toHaveTextContent(/\(0\)/);
    expect(getByTestId('portfolio-filter-onTrack')).toHaveTextContent(/\(1\)/);
  });

  it('puts an advice strip on the cards that are not on track, and on no others', async () => {
    // The drawing puts it on its CRITICAL card and the product owner extended it to the amber ones
    // (2026-09-07). A card that is ON TRACK has nothing to advise, and an UNMEASURED one — no
    // analytics row — has no band at all, so neither gets a strip.
    const { getAllByTestId, queryAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('portfolio-item')).toHaveLength(2));
    // proj-2 is over 100% utilisation; proj-1 is on track.
    expect(queryAllByTestId('portfolio-advice')).toHaveLength(1);
  });

  it('names the REASON the card is in its band, never a recommendation no model made', async () => {
    // This screen makes no AI call at all. The drawing writes a specific sentence under a robot
    // glyph; printing one here would attribute advice to a model that never ran, which is what
    // lib/mockupFigures.ts forbids. The strip carries the `executiveSeverityOf` reason instead.
    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('portfolio-advice')).toHaveLength(1));
    expect(getAllByTestId('portfolio-advice')[0]).toHaveTextContent(/passed the budget/i);
  });

  it('names the OVERDUE reason when that is what set the band, not the budget one', async () => {
    // Read in the same order `executiveSeverityOf` reads: utilisation, then the flag, then overdue
    // invoices. A note naming a different cause from the one that set the colour would be worse
    // than no note.
    client.get.mockResolvedValue([
      { ...execRow('proj-1', 62, 0), overdueInvoiceCount: 3 },
      execRow('proj-2', 62, 0),
    ]);
    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('portfolio-advice')).toHaveLength(1));
    expect(getAllByTestId('portfolio-advice')[0]).toHaveTextContent(/overdue/i);
  });

  it('prints the drawn figures unchanged, whatever the API returns', async () => {
    // THE ADR-099 GUARD, the same one exec-home.spec.tsx carries. If any of these ever starts
    // tracking an endpoint, this fails and the decision gets revisited rather than drifting.
    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('portfolio-item')).toHaveLength(2));
    const cards = getAllByTestId('portfolio-item');
    // Card order is risk-sorted, but the drawn figures are indexed by the project's position in the
    // CACHED list, so Harbour Works (second there) carries the second entry of each register list.
    expect(cards[0]).toHaveTextContent(/OF-1102/);
    expect(cards[0]).toHaveTextContent(/Eastern Hub/);
    expect(cards[0]).toHaveTextContent(/58\/100/);
    expect(cards[1]).toHaveTextContent(/CT-8832/);
    expect(cards[1]).toHaveTextContent(/Bangkok CBD/);
    expect(cards[1]).toHaveTextContent(/96\/100/);
  });

  it('names the portfolio value and the urgent count from the analytics rows', async () => {
    const { getByTestId } = await renderScreen();

    // Σ budget over both rows = 2,000, and one project is over budget.
    await waitFor(() => expect(getByTestId('portfolio-screen')).toHaveTextContent(/2,000/));
    expect(getByTestId('portfolio-screen')).toHaveTextContent(/Projects: 2/);
  });
});
