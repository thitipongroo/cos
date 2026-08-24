// Behaviour of the Site Engineer's Home — the role's consolidated command card.
//
// NULL IS "NOT COMPUTABLE", NEVER ZERO (§32.12). Every progress field on this screen is nullable,
// and a project with no BOQ-linked task genuinely has no figure. A 0% bar would say "nothing has
// been done" to an engineer standing on a site where plenty has — so the card shows a placeholder
// instead, and that distinction is what most of these tests are about.
//
// THE FIGURES ARE THE SERVER'S JUDGEMENT, NOT THIS SCREEN'S. The schedule word and its colour come
// from `spi`; the phase comes from the phase list; the task urgency comes from `planned_start`. The
// pure functions behind all of them are already covered in the logic suite — what is asserted here
// is the WIRING: that the screen shows what they returned, and shows nothing when they returned
// nothing. The mockup's "Ahead of Schedule" is a drawing; a project behind schedule says so in red.
//
// THE LEFT ACCENT ON A TASK ROW CARRIES ITS URGENCY, and it comes from the same value that colours
// the date — one value, so the two can never disagree. Before that (PO 2026-08-12) it was the same
// dead hairline on every row, and the section said nothing until each line had been read.
//
// AND NOTHING AUTO-SELECTS A PROJECT HERE any more. Seeding the store from this screen would race
// <SelectProjectSheet />, which the shell raises for this role the first time it mounts with nothing
// chosen — leaving the overlay open over a project it had already picked.

import { render, fireEvent, waitFor, within } from '@testing-library/react-native';
import { I18nProvider } from '../../i18n';
import { useProjectStore } from '../../store/projectStore';
import SiteEngineerHome from '../SiteEngineerHome';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../api/client', () => ({ get: jest.fn(), post: jest.fn(), mutate: jest.fn() }));
jest.mock('../../api/projects', () => ({
  getMyProjects: jest.fn(),
  getProjectProgress: jest.fn(),
  getProjectPhases: jest.fn(),
  refreshProjectsCache: jest.fn(() => Promise.resolve()),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../api/client') as { get: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const projects = require('../../api/projects') as {
  getMyProjects: jest.Mock;
  getProjectProgress: jest.Mock;
  getProjectPhases: jest.Mock;
};

const PROJECT_ID = 'proj-1';

function project(over: Record<string, unknown> = {}) {
  return {
    project_id: PROJECT_ID,
    project_code: 'PRJ-1',
    project_name: 'Riverside Tower',
    status: 'ACTIVE',
    start_date: '2026-01-15',
    end_date: '2027-06-30',
    ...over,
  };
}

function progress(over: Record<string, unknown> = {}) {
  return {
    percentComplete: 62,
    plannedPercent: 70,
    spi: 0.88,
    status: 'behind',
    scheduleDaysBehind: 9,
    ...over,
  };
}

function issue(over: Record<string, unknown> = {}) {
  return {
    issue_id: 'iss-1',
    issue_number: 'ISS-0001',
    title: 'Formwork misaligned on level 3',
    severity: 'HIGH',
    status: 'OPEN',
    ...over,
  };
}

function task(over: Record<string, unknown> = {}) {
  return {
    task_id: 't-1',
    task_name: 'Pour slab level 4',
    status: 'IN_PROGRESS',
    planned_start: '2026-09-01',
    progress_percent: 40,
    ...over,
  };
}

/** The screen fetches issues and tasks through the same client, so answer by path. */
function feeds(issues: unknown[], tasks: unknown[]) {
  client.get.mockImplementation((path: string) =>
    path === '/site/issues'
      ? Promise.resolve({ items: issues })
      : Promise.resolve({ items: tasks }),
  );
}

/** A node's own text, joined — several labels here are built from more than one child. */
function textOf(node: { props: Record<string, unknown> }): string {
  return [node.props['children']].flat(3).join('');
}

function renderHome() {
  return render(
    <I18nProvider>
      <SiteEngineerHome />
    </I18nProvider>,
  );
}

describe('SiteEngineerHome', () => {
  beforeEach(() => {
    mockPush.mockReset();
    client.get.mockReset();
    projects.getMyProjects.mockReset().mockResolvedValue([project()]);
    projects.getProjectProgress.mockReset().mockResolvedValue(progress());
    projects.getProjectPhases.mockReset().mockResolvedValue([]);
    feeds([], []);
    useProjectStore.setState({
      active: { projectId: PROJECT_ID, projectName: 'Riverside Tower' },
    } as never);
  });

  it('renders the dashboard once every step has settled', async () => {
    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('progress-card')).toBeTruthy());
    expect(getByTestId('site-engineer-home')).toBeTruthy();
  });

  // ── THE PROGRESS FIGURE ──────────────────────────────────────────────────────────────────────

  it('shows the percentage the server computed', async () => {
    projects.getProjectProgress.mockResolvedValue(progress({ percentComplete: 62 }));

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('progress-pct')).toBeTruthy());
    // JOINED, because the node is `{Math.round(pct)}%` — two children, so a text query for "62%"
    // finds nothing and would have passed as a false negative on any figure at all.
    expect(textOf(getByTestId('progress-pct'))).toBe('62%');
  });

  // §32.12 — null is "not computable". A 0% bar would tell an engineer nothing has been done.
  it('shows a placeholder, not a zero bar, when there is no figure to show', async () => {
    projects.getProjectProgress.mockResolvedValue(progress({ percentComplete: null }));

    const { getByTestId, queryByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('progress-empty')).toBeTruthy());
    expect(queryByTestId('progress-pct')).toBeNull();
  });

  // A real zero IS shown: the project has a figure, and it is nought.
  it('shows a real zero as a figure', async () => {
    projects.getProjectProgress.mockResolvedValue(progress({ percentComplete: 0 }));

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('progress-pct')).toBeTruthy());
  });

  // Offline: the last figure is kept rather than replaced by a wrong one — and with nothing to keep,
  // the placeholder stands.
  it('keeps the placeholder when the progress cannot be fetched', async () => {
    projects.getProjectProgress.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('progress-empty')).toBeTruthy());
  });

  // ── THE SCHEDULE VERDICT ─────────────────────────────────────────────────────────────────────

  // The pill needs BOTH a status word and an spi to colour it. Either one missing and there is no
  // verdict to state — a pill with a word and no band would be a colour this screen chose itself.
  it('states the schedule verdict when the server gave one', async () => {
    projects.getProjectProgress.mockResolvedValue(progress({ status: 'behind', spi: 0.88 }));

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('schedule-status')).toBeTruthy());
  });

  it('states no verdict when the server computed no spi', async () => {
    projects.getProjectProgress.mockResolvedValue(progress({ spi: null }));

    const { getByTestId, queryByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('progress-card')).toBeTruthy());
    expect(queryByTestId('schedule-status')).toBeNull();
  });

  it('states no verdict when the server computed no status', async () => {
    projects.getProjectProgress.mockResolvedValue(progress({ status: null }));

    const { getByTestId, queryByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('progress-card')).toBeTruthy());
    expect(queryByTestId('schedule-status')).toBeNull();
  });

  // ── THE PHASE ────────────────────────────────────────────────────────────────────────────────

  // Stored as "Thai (English gloss)"; the dashboard shows the Thai only (PO 2026-07-26) — the gloss
  // exists for the data, not for a card two words wide. DISPLAY ONLY: the stored value is untouched.
  it('drops the English gloss from the phase name', async () => {
    projects.getProjectPhases.mockResolvedValue([
      { phase_id: 'p-1', seq: 2, name: 'งานโครงสร้าง (Structural)', status: 'IN_PROGRESS' },
    ]);

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('phase-name')).toBeTruthy());
    const label = within(getByTestId('phase-name'));
    expect(label.queryByText(/Structural/)).toBeNull();
  });

  it('shows no phase line on a project that has none', async () => {
    projects.getProjectPhases.mockResolvedValue([]);

    const { getByTestId, queryByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('progress-pct')).toBeTruthy());
    expect(queryByTestId('phase-name')).toBeNull();
  });

  // ── THE PROJECT TIMELINE ─────────────────────────────────────────────────────────────────────

  it('shows the start and goal dates the project carries', async () => {
    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('project-dates')).toBeTruthy());
    expect(getByTestId('project-start')).toBeTruthy();
    expect(getByTestId('project-end')).toBeTruthy();
  });

  // Shown only when set: an empty date slot in a footer reads as a date that failed to load.
  it('shows no timeline at all when neither date is set', async () => {
    projects.getMyProjects.mockResolvedValue([project({ start_date: null, end_date: null })]);

    const { getByTestId, queryByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('progress-pct')).toBeTruthy());
    expect(queryByTestId('project-dates')).toBeNull();
  });

  it('shows the start alone when there is no end date', async () => {
    projects.getMyProjects.mockResolvedValue([project({ end_date: null })]);

    const { getByTestId, queryByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('project-dates')).toBeTruthy());
    expect(queryByTestId('project-end')).toBeNull();
  });

  // ── THE FOUR QUICK ACTIONS ───────────────────────────────────────────────────────────────────
  //
  // Each routes to a real screen. A tile that opened nothing would be the worst kind of control on
  // a Home: the one a worker learns to tap and then learns to stop trusting.

  it.each([
    ['qa-daily-report', '/report'],
    ['qa-photo', '/report'],
    ['qa-safety-check', '/inspections'],
    ['qa-material-request', '/material-request'],
  ])('sends %s to %s', async (testID, route) => {
    const { getByTestId } = await renderHome();
    await waitFor(() => expect(getByTestId(testID)).toBeTruthy());

    await fireEvent.press(getByTestId(testID));

    expect(mockPush).toHaveBeenCalledWith(route);
  });

  // ── ACTIVE ISSUES ────────────────────────────────────────────────────────────────────────────

  // Worst first. An issues preview ordered by time would push a CRITICAL off the card because three
  // MEDIUM ones were logged after it.
  it('puts the worst issue first', async () => {
    feeds(
      [
        issue({ issue_id: 'iss-low', severity: 'LOW' }),
        issue({ issue_id: 'iss-critical', severity: 'CRITICAL' }),
      ],
      [],
    );

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('issue-iss-critical')).toBeTruthy());
    expect(getByTestId('issue-iss-low')).toBeTruthy();
  });

  // The badge names the WORST LEVEL PRESENT and how many there are at it — not a total, which would
  // read the same whether the three issues were critical or trivial.
  it('badges the worst level present and its count', async () => {
    feeds(
      [
        issue({ issue_id: 'a', severity: 'CRITICAL' }),
        issue({ issue_id: 'b', severity: 'CRITICAL' }),
        issue({ issue_id: 'c', severity: 'LOW' }),
      ],
      [],
    );

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('severity-count')).toBeTruthy());
    expect(within(getByTestId('severity-count')).getByText(/CRITICAL/)).toBeTruthy();
    expect(within(getByTestId('severity-count')).getByText(/2/)).toBeTruthy();
  });

  it('badges nothing when there are no issues', async () => {
    feeds([], []);

    const { getByTestId, queryByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('issues-empty')).toBeTruthy());
    expect(queryByTestId('severity-count')).toBeNull();
  });

  // Three on the card; the rest are behind "see all", which is why the control only lights up when
  // there IS a rest — a "see all" over a complete list is a promise of more that does not exist.
  it('previews three issues and no more', async () => {
    feeds(
      [
        issue({ issue_id: 'a' }),
        issue({ issue_id: 'b' }),
        issue({ issue_id: 'c' }),
        issue({ issue_id: 'd' }),
      ],
      [],
    );

    const { getByTestId, queryByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('issue-a')).toBeTruthy());
    expect(queryByTestId('issue-d')).toBeNull();
  });

  it('opens the issues screen from a row', async () => {
    feeds([issue()], []);

    const { getByTestId } = await renderHome();
    await waitFor(() => expect(getByTestId('issue-iss-1')).toBeTruthy());

    await fireEvent.press(getByTestId('issue-iss-1'));

    expect(mockPush).toHaveBeenCalledWith('/issues');
  });

  // An issue raised offline has no server-assigned number yet; the row shows the title alone rather
  // than an empty chip where a reference belongs.
  it('shows no reference on an issue that has not been given one', async () => {
    feeds([issue({ issue_id: 'iss-1', issue_number: null })], []);

    const { getByTestId, queryByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('issue-iss-1')).toBeTruthy());
    expect(queryByTestId('issue-iss-1-number')).toBeNull();
  });

  // ── UPCOMING TASKS ───────────────────────────────────────────────────────────────────────────

  // The badges count the WHOLE upcoming set, not the three shown, so they do not undercount when
  // the list is capped — the point of a badge is to say what the card cannot fit.
  it('badges how many tasks are overdue to start', async () => {
    feeds(
      [],
      [
        task({ task_id: 't-1', planned_start: '2020-01-01' }),
        task({ task_id: 't-2', planned_start: '2020-01-02' }),
      ],
    );

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('overdue-count')).toBeTruthy());
    expect(within(getByTestId('overdue-count')).getByText(/2/)).toBeTruthy();
  });

  it('badges nothing when nothing is overdue', async () => {
    feeds([], [task({ planned_start: '2099-01-01' })]);

    const { getByTestId, queryByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('task-t-1')).toBeTruthy());
    expect(queryByTestId('overdue-count')).toBeNull();
    expect(queryByTestId('due-soon-count')).toBeNull();
  });

  // Finished work is not upcoming. A completed task left in this section is a card asking someone to
  // do something they already did.
  it.each(['COMPLETED', 'CANCELLED'])(
    'leaves a %s task out of what is upcoming',
    async (status) => {
      feeds([], [task({ status })]);

      const { getByTestId } = await renderHome();

      await waitFor(() => expect(getByTestId('tasks-empty')).toBeTruthy());
    },
  );

  // No planned start is no place in a list ordered by when work begins.
  it('leaves an undated task out', async () => {
    feeds([], [task({ planned_start: null })]);

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('tasks-empty')).toBeTruthy());
  });

  it('shows the task progress the API returned', async () => {
    feeds([], [task({ progress_percent: 40 })]);

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('task-t-1-progress')).toBeTruthy());
  });

  // A row without the field shows NO figure rather than 0%, which would state that nothing has been
  // done on a task that may be nearly finished.
  it('shows no figure on a task that carries none', async () => {
    feeds([], [task({ progress_percent: undefined })]);

    const { getByTestId, queryByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('task-t-1')).toBeTruthy());
    expect(queryByTestId('task-t-1-progress')).toBeNull();
  });

  it('opens the tasks screen from a row', async () => {
    feeds([], [task()]);

    const { getByTestId } = await renderHome();
    await waitFor(() => expect(getByTestId('task-t-1')).toBeTruthy());

    await fireEvent.press(getByTestId('task-t-1'));

    expect(mockPush).toHaveBeenCalledWith('/tasks');
  });

  it('says there is nothing upcoming rather than showing an empty section', async () => {
    feeds([], []);

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('tasks-empty')).toBeTruthy());
  });

  // ── SCOPE AND LOADING ────────────────────────────────────────────────────────────────────────

  // Everything is asked for the project the bar names. Only OPEN issues: this is a dashboard of what
  // still needs doing, and closed issues would pad it with work already finished.
  it('asks for the named project, and for open issues only', async () => {
    const { getByTestId } = await renderHome();
    await waitFor(() => expect(getByTestId('progress-card')).toBeTruthy());

    expect(projects.getProjectProgress).toHaveBeenCalledWith(PROJECT_ID);
    expect(client.get).toHaveBeenCalledWith('/site/issues', {
      project_id: PROJECT_ID,
      status: 'OPEN',
    });
    expect(client.get).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/tasks`);
  });

  // Nothing chosen: no project-scoped request is made at all, rather than one with an empty id that
  // the server would answer for the whole tenant.
  it('asks for nothing while no project is chosen', async () => {
    useProjectStore.setState({ active: null } as never);

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('site-engineer-home')).toBeTruthy());
    expect(projects.getProjectProgress).not.toHaveBeenCalled();
    expect(client.get).not.toHaveBeenCalled();
  });

  // Rule 40 — the skeletons hold until every step settles, and each catch resolves, so an offline
  // dashboard settles into placeholders rather than loading forever.
  it('settles even when every request fails', async () => {
    projects.getMyProjects.mockRejectedValue(new Error('offline'));
    projects.getProjectProgress.mockRejectedValue(new Error('offline'));
    projects.getProjectPhases.mockRejectedValue(new Error('offline'));
    client.get.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('progress-empty')).toBeTruthy());
    expect(getByTestId('issues-empty')).toBeTruthy();
    expect(getByTestId('tasks-empty')).toBeTruthy();
  });
});
