// Behaviour of the Project Manager's Home.
//
// A FAILED LOAD AND AN EMPTY PORTFOLIO MUST NOT READ THE SAME, and this screen is where that rule
// was learned. The first version swallowed the failure and left `rows` empty, which the list then
// captioned "You are not a member of any project yet" — a claim about the manager's memberships made
// from a request that never answered. The very first capture of this screen photographed exactly
// that: an empty dashboard for a manager with three projects, while the Finance tab (same call,
// mounted a minute later) showed all three.
//
// THE VARIANCE TILE HAS THREE STATES AND THREE SENTENCES for the same reason. "No allocation" is a
// statement about the manager's budgets; a request that did not answer supports no statement at all,
// so a failed load says something different again.
//
// §32.12: NULL IS "NOT COMPUTABLE", NEVER ZERO. A project with no BOQ-linked task genuinely has no
// percentage, and a 0% bar would read as "no work done" on a site where plenty has been.
//
// AND IT LOADS ON FOCUS, NOT ON MOUNT — but only until the first success. The mount version ran once
// immediately after sign-in, and a request that lost that race left the dashboard permanently empty
// with no way to retry but killing the app. Refetching on every visit would instead pay three
// requests per project to fix a case already fixed.

import { render, fireEvent, waitFor, within } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import PmHome from '../PmHome';

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const react = require('react') as typeof import('react');
  return {
    useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
    useFocusEffect: (cb: () => void | (() => void)) => react.useEffect(cb, [cb]),
  };
});

jest.mock('../../../api/client', () => ({ get: jest.fn(), post: jest.fn(), mutate: jest.fn() }));
jest.mock('../../../api/projects', () => ({
  ...jest.requireActual('../../../api/projects'),
  getMyProjects: jest.fn(),
  getProjectProgress: jest.fn(),
  getProjectPhases: jest.fn(),
  refreshProjectsCache: jest.fn(() => Promise.resolve()),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as { get: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../../../api/projects') as {
  getMyProjects: jest.Mock;
  getProjectProgress: jest.Mock;
  getProjectPhases: jest.Mock;
};

function project(n: number, over: Record<string, unknown> = {}) {
  return {
    project_id: `p-${n}`,
    project_code: `PRJ-${n}`,
    project_name: `Project ${n}`,
    status: 'ACTIVE',
    start_date: null,
    end_date: null,
    ...over,
  };
}

function budget(over: Record<string, unknown> = {}) {
  return {
    budget: {
      total_budget_amount: '1000000.0000',
      total_budget_currency: 'THB',
      allocated_amount: '900000.0000',
      committed_amount: '400000.0000',
      actual_amount: '350000.0000',
      ...over,
    },
  };
}

function issue(over: Record<string, unknown> = {}) {
  return {
    issue_id: 'iss-1',
    issue_number: 'ISS-0001',
    title: 'Crane out of service',
    severity: 'CRITICAL',
    status: 'OPEN',
    ...over,
  };
}

/** Issues from `/site/issues`; every budget answers the same figure unless told otherwise. */
function respond(issues: unknown[], budgets?: Record<string, unknown>) {
  client.get.mockImplementation((path: string) => {
    const match = /^\/finance\/budget\/(.+)$/.exec(path);
    if (match) {
      if (budgets === undefined) return Promise.resolve(budget());
      const answer = budgets[match[1]!];
      return answer === undefined ? Promise.reject(new Error('404')) : Promise.resolve(answer);
    }
    return Promise.resolve({ items: issues });
  });
}

function renderHome() {
  return render(
    <I18nProvider>
      <PmHome />
    </I18nProvider>,
  );
}

describe('PmHome', () => {
  beforeEach(() => {
    mockPush.mockReset();
    client.get.mockReset();
    api.getMyProjects.mockReset().mockResolvedValue([project(1)]);
    api.getProjectProgress.mockReset().mockResolvedValue({
      percentComplete: 62,
      plannedPercent: 70,
      spi: 0.9,
      status: 'behind',
      scheduleDaysBehind: 5,
    });
    api.getProjectPhases.mockReset().mockResolvedValue([]);
    respond([]);
  });

  it('renders the dashboard once the figures land', async () => {
    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('pm-project-p-1')).toBeTruthy());
    expect(getByTestId('kpi-active-projects')).toBeTruthy();
    expect(getByTestId('kpi-total-variance')).toBeTruthy();
  });

  // ── THE FAILURE THAT WAS DRAWN AS AN EMPTY PORTFOLIO ─────────────────────────────────────────

  it('says the projects could not be fetched, rather than that there are none', async () => {
    api.getMyProjects.mockRejectedValue(new Error('offline'));

    const { getByTestId, queryByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('pm-projects-failed')).toBeTruthy());
    // The claim it must NOT make.
    expect(queryByTestId('pm-no-projects')).toBeNull();
  });

  // And the other way round: a manager who really is on no projects is told so, not shown a failure.
  it('says there are none when there really are none', async () => {
    api.getMyProjects.mockResolvedValue([]);

    const { getByTestId, queryByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('pm-no-projects')).toBeTruthy());
    expect(queryByTestId('pm-projects-failed')).toBeNull();
  });

  // Neither notice while the answer is still coming: a screen that flashed "no projects" during the
  // load would state the same falsehood, just briefly.
  it('claims neither while the request is still in flight', async () => {
    api.getMyProjects.mockReturnValue(new Promise(() => undefined));

    const { queryByTestId } = await renderHome();

    expect(queryByTestId('pm-no-projects')).toBeNull();
    expect(queryByTestId('pm-projects-failed')).toBeNull();
  });

  // ── THE VARIANCE TILE ────────────────────────────────────────────────────────────────────────

  it('states the variance the budgets support', async () => {
    respond([], { 'p-1': budget() });

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('pm-project-p-1')).toBeTruthy());
    expect(within(getByTestId('kpi-total-variance')).getByText(/%/)).toBeTruthy();
  });

  // Three states, three sentences. A failed load must not say "No allocation" — that is a statement
  // about the manager's budgets, and a request that did not answer supports no statement.
  it('says the variance is unknown when the load failed', async () => {
    api.getMyProjects.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('pm-projects-failed')).toBeTruthy());
    const tile = within(getByTestId('kpi-total-variance'));
    expect(tile.queryByText(/%/)).toBeNull();
  });

  // Nothing allocated is a different nothing again: the request answered, and the answer was that
  // there is no baseline to measure a variance against.
  it('says the variance is unavailable when nothing is allocated', async () => {
    respond([], { 'p-1': budget({ allocated_amount: '0' }) });

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('pm-project-p-1')).toBeTruthy());
    expect(within(getByTestId('kpi-total-variance')).queryByText(/%/)).toBeNull();
  });

  // The three sentences must actually DIFFER, or the tile has one state wearing three names. Each
  // is read only AFTER that render has settled — reading before the load lands would compare three
  // copies of the same initial state and pass without proving anything.
  it('says three different things in the three states', async () => {
    respond([], { 'p-1': budget() });
    const a = await renderHome();
    await waitFor(() => expect(a.getByTestId('pm-project-p-1')).toBeTruthy());
    const withFigure = textOf(a.getByTestId('kpi-total-variance'));

    respond([], { 'p-1': budget({ allocated_amount: '0' }) });
    const b = await renderHome();
    await waitFor(() => expect(b.getByTestId('pm-project-p-1')).toBeTruthy());
    const unallocated = textOf(b.getByTestId('kpi-total-variance'));

    api.getMyProjects.mockRejectedValue(new Error('offline'));
    const c = await renderHome();
    await waitFor(() => expect(c.getByTestId('pm-projects-failed')).toBeTruthy());
    const failed = textOf(c.getByTestId('kpi-total-variance'));

    expect(new Set([withFigure, unallocated, failed]).size).toBe(3);
  });

  // NO CHEVRON, THEREFORE NO PRESS (PO 2026-08-10). The rule this screen follows is that a chevron
  // marks a card that opens something — so a card that navigates without one is the same defect read
  // from the other side.
  it('does not navigate from the variance tile', async () => {
    const { getByTestId } = await renderHome();
    await waitFor(() => expect(getByTestId('kpi-total-variance')).toBeTruthy());

    await fireEvent.press(getByTestId('kpi-total-variance'));

    expect(mockPush).not.toHaveBeenCalled();
  });

  // ── CRITICAL BLOCKERS ────────────────────────────────────────────────────────────────────────

  // The card is drawn only when something is actually blocked: an empty red-striped panel reads as
  // an alert in its own right.
  it('shows no blocker card while nothing is blocked', async () => {
    respond([]);

    const { getByTestId, queryByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('pm-no-blockers')).toBeTruthy());
    expect(queryByTestId('pm-blockers')).toBeNull();
  });

  // WORST FIRST: a card ordered by time would show a MEDIUM issue raised this morning over the
  // CRITICAL one raised yesterday, on the one card a manager reads to decide what to deal with.
  it('names the worst blocker, not the newest', async () => {
    respond([
      issue({ issue_id: 'iss-low', severity: 'LOW', title: 'Signage faded' }),
      issue({ issue_id: 'iss-crit', severity: 'CRITICAL', title: 'Crane out of service' }),
    ]);

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('pm-blockers')).toBeTruthy());
    expect(getByTestId('pm-blockers').props.accessibilityLabel).toBe('Crane out of service');
  });

  it('opens the issues list from the blocker card', async () => {
    respond([issue()]);

    const { getByTestId } = await renderHome();
    await waitFor(() => expect(getByTestId('pm-blockers')).toBeTruthy());

    await fireEvent.press(getByTestId('pm-blockers'));

    expect(mockPush).toHaveBeenCalledWith('/issues');
  });

  it('opens the issues list from the manage control', async () => {
    respond([issue()]);

    const { getByTestId } = await renderHome();
    await waitFor(() => expect(getByTestId('pm-blockers-manage')).toBeTruthy());

    await fireEvent.press(getByTestId('pm-blockers-manage'));

    expect(mockPush).toHaveBeenCalledWith('/issues');
  });

  // Only OPEN issues: a dashboard of what needs dealing with, padded with issues already resolved,
  // would be a card that never empties.
  it('asks only for open issues', async () => {
    await renderHome();

    await waitFor(() => expect(client.get).toHaveBeenCalled());
    expect(client.get).toHaveBeenCalledWith('/site/issues', { status: 'OPEN' });
  });

  // ── THE PROJECT CARDS ────────────────────────────────────────────────────────────────────────

  it('shows the progress figure a project has', async () => {
    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('pm-progress-p-1')).toBeTruthy());
    expect(within(getByTestId('pm-project-p-1')).getByText('62%')).toBeTruthy();
  });

  // §32.12 — no figure means no BAR either. A zero-width bar in a track still draws the track, which
  // reads as a project at 0% rather than one whose progress cannot be computed.
  it('draws no bar at all when there is no figure', async () => {
    api.getProjectProgress.mockResolvedValue({
      percentComplete: null,
      plannedPercent: null,
      spi: null,
      status: null,
      scheduleDaysBehind: null,
    });

    const { getByTestId, queryByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('pm-project-p-1')).toBeTruthy());
    expect(queryByTestId('pm-progress-p-1')).toBeNull();
  });

  // A progress request that REJECTED is the same "not computable" as one that answered null — the
  // screen must not enter zero for it.
  it('draws no bar when the progress request failed', async () => {
    api.getProjectProgress.mockRejectedValue(new Error('offline'));

    const { getByTestId, queryByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('pm-project-p-1')).toBeTruthy());
    expect(queryByTestId('pm-progress-p-1')).toBeNull();
  });

  it('names the current phase where the project has one', async () => {
    api.getProjectPhases.mockResolvedValue([
      { phase_id: 'ph-1', seq: 2, name: 'Structure', status: 'IN_PROGRESS' },
    ]);

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('pm-project-p-1')).toBeTruthy());
    expect(within(getByTestId('pm-project-p-1')).getByText(/Structure/)).toBeTruthy();
  });

  // A project with no phases says so, rather than leaving the line blank — a blank under a project
  // name reads as a phase that failed to load.
  it('says a project has no phase rather than leaving the line empty', async () => {
    api.getProjectPhases.mockResolvedValue([]);

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('pm-project-p-1')).toBeTruthy());
    expect(within(getByTestId('pm-project-p-1')).getByText(/phase/i)).toBeTruthy();
  });

  // THAT project's analytics: `/dashboard` takes the id, so the card opens the project it names
  // instead of dropping the reader on a picker to choose it again.
  it('opens the project it names', async () => {
    api.getMyProjects.mockResolvedValue([project(1), project(2)]);

    const { getByTestId } = await renderHome();
    await waitFor(() => expect(getByTestId('pm-project-p-2')).toBeTruthy());

    await fireEvent.press(getByTestId('pm-project-p-2'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/dashboard',
      params: { projectId: 'p-2' },
    });
  });

  it('lists every project the manager is on', async () => {
    api.getMyProjects.mockResolvedValue([project(1), project(2), project(3)]);

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('pm-project-p-3')).toBeTruthy());
    expect(getByTestId('pm-project-p-1')).toBeTruthy();
    expect(getByTestId('pm-project-p-2')).toBeTruthy();
  });

  // ── RELOADING ────────────────────────────────────────────────────────────────────────────────

  // Only until the first success: this screen costs three requests per project, and re-running them
  // on every visit would pay that repeatedly to fix a case that has already been fixed.
  it('does not refetch once the load has succeeded', async () => {
    const { getByTestId, rerender } = await renderHome();
    await waitFor(() => expect(getByTestId('pm-project-p-1')).toBeTruthy());
    const calls = api.getMyProjects.mock.calls.length;

    await rerender(
      <I18nProvider>
        <PmHome />
      </I18nProvider>,
    );

    expect(api.getMyProjects.mock.calls.length).toBe(calls);
  });
});

/** A tile's own text, joined. */
function textOf(node: { props: Record<string, unknown> }): string {
  const walk = (n: unknown): string[] => {
    if (typeof n === 'string' || typeof n === 'number') return [String(n)];
    if (!n || typeof n !== 'object') return [];
    const el = n as { props?: { children?: unknown } };
    return [el.props?.children].flat(4).flatMap(walk);
  };
  return walk({ props: node.props }).join(' ');
}
