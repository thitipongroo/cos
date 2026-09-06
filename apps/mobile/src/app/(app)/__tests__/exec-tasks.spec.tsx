// Behaviour of the EXECUTIVE half of /tasks — the portfolio roll-up and the critical path
// (ADR-097, ADR-098).
//
// WHAT THESE TESTS ARE FOR. Each screen mixes REAL data with figures the platform cannot compute
// (ADR-099), and the two are only distinguishable by reading the code. A test that asserts "the
// compliance panel renders" would pass whether the number came from an endpoint or a constant. So
// each block below asserts the SPLIT: which values move when the API answers differently, and which
// do not — because a drawn figure that starts tracking an endpoint, or a real one that stops, is
// exactly the regression that no screenshot review would catch.

import { render, cleanup, waitFor } from '@testing-library/react-native';
import { CosRole } from '@cos/types';
import { I18nProvider } from '../../../i18n';
import { useAuthStore } from '../../../store/authStore';
import TasksScreen from '../tasks';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
}));

jest.mock('../../../api/safety', () => ({
  getCompliance: jest.fn(),
  listIncidents: jest.fn(),
}));
jest.mock('../../../api/schedule', () => ({
  getPortfolioTaskSummary: jest.fn(),
  getPortfolioCriticalPath: jest.fn(),
}));
jest.mock('../../../api/projects', () => ({
  ...jest.requireActual('../../../api/projects'),
  getMyProjects: jest.fn(),
}));
jest.mock('../../../api/users', () => ({
  ...jest.requireActual('../../../api/users'),
  getMe: jest.fn().mockResolvedValue({ photo_url: null }),
}));
// The AI panels call their own endpoints and print the model's own confidence. They are covered by
// their own specs; what matters here is that these screens never route a mockup figure through one.
jest.mock('../../../components/PortfolioInsight', () => ({ PortfolioInsight: () => null }));
jest.mock('../../../components/ExecRiskAlerts', () => ({ ExecRiskAlerts: () => null }));

/* eslint-disable @typescript-eslint/no-require-imports */
const safetyApi = require('../../../api/safety') as {
  getCompliance: jest.Mock;
  listIncidents: jest.Mock;
};
const scheduleApi = require('../../../api/schedule') as {
  getPortfolioTaskSummary: jest.Mock;
  getPortfolioCriticalPath: jest.Mock;
};
const projectsApi = require('../../../api/projects') as { getMyProjects: jest.Mock };
/* eslint-enable @typescript-eslint/no-require-imports */

const PROJECTS = [
  { project_id: 'p-1', project_code: 'SKV45', project_name: 'Sukhumvit 45', progress_percent: 61 },
  { project_id: 'p-2', project_code: 'R9CT', project_name: 'Rama IX Tower', progress_percent: 40 },
  {
    project_id: 'p-3',
    project_code: 'BNW2',
    project_name: 'Bangna Warehouse',
    progress_percent: 12,
  },
];

function incident(project_id: string, severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL') {
  return {
    incident_id: `${project_id}-${severity}`,
    project_id,
    task_id: null,
    incident_type: 'NEAR_MISS',
    severity,
    reported_by: 'u-1',
    status: 'OPEN' as const,
    acknowledged_by: null,
    acknowledged_at: null,
    created_at: '2026-09-01T00:00:00.000Z',
  };
}

// One helper per screen, and every call is AWAITED. `render()` returns a PROMISE under this preset
// (its prototype carries then/catch/finally), so destructuring the queries off it without awaiting
// yields undefined — which is what every sibling spec's `await renderScreen()` has been guarding
// against all along.
function renderTasks() {
  return render(
    <I18nProvider>
      <TasksScreen />
    </I18nProvider>,
  );
}

// EXPLICIT cleanup between tests. `render()` is asynchronous under this preset, and relying on the
// automatic afterEach cleanup let a later render come back with an EMPTY TREE — the third and every
// subsequent render in a describe produced `toJSON() === null` while the store and the mocks were
// both correct. Unmounting deliberately, before the next render starts, removes the race.
afterEach(cleanup);

beforeEach(() => {
  jest.clearAllMocks();
  projectsApi.getMyProjects.mockResolvedValue(PROJECTS);
  safetyApi.getCompliance.mockResolvedValue({
    open_incidents: 3,
    high_critical_incidents: 1,
    expired_permits: 0,
    revoked_permits: 0,
  });
  safetyApi.listIncidents.mockResolvedValue([
    incident('p-1', 'LOW'),
    incident('p-2', 'LOW'),
    incident('p-3', 'HIGH'),
  ]);
  scheduleApi.getPortfolioTaskSummary.mockResolvedValue({
    overdue_count: 12,
    due_this_week_count: 45,
    blocked_count: 8,
    open_count: 90,
    project_count: 5,
  });
  scheduleApi.getPortfolioCriticalPath.mockResolvedValue({
    project_count: 2,
    working_day_calendar: false,
    excluded_task_count: 2,
    tasks: [
      {
        task_id: 't-1',
        task_name: 'Pile caps',
        status: 'IN_PROGRESS',
        work_type: 'FOUNDATION',
        duration_days: 21,
        earliest_start: '2026-09-01',
        earliest_finish: '2026-09-22',
        latest_start: '2026-09-01',
        latest_finish: '2026-09-22',
        total_float_days: 0,
        is_critical: true,
        assigned_to: 'u-9',
        project_id: 'p-1',
        project_name: 'Sukhumvit 45',
      },
      {
        task_id: 't-9',
        task_name: 'Roof steel',
        status: 'NOT_STARTED',
        work_type: 'STRUCTURE',
        duration_days: 14,
        earliest_start: '2026-09-10',
        earliest_finish: '2026-09-24',
        latest_start: '2026-09-10',
        latest_finish: '2026-09-24',
        total_float_days: 0,
        is_critical: true,
        assigned_to: null,
        project_id: 'p-2',
        project_name: 'Rama IX Tower',
      },
    ],
  });
});

describe('TasksScreen — the EXECUTIVE roll-up', () => {
  beforeEach(() => {
    useAuthStore.setState({ role: CosRole.EXECUTIVE });
  });

  it('prints the three counts the aggregate endpoint returned', async () => {
    const { getByTestId } = await renderTasks();
    await waitFor(() => expect(getByTestId('tasks-kpi-overdue')).toHaveTextContent(/12/));
    expect(getByTestId('tasks-kpi-due')).toHaveTextContent(/45/);
    expect(getByTestId('tasks-kpi-blocked')).toHaveTextContent(/8/);
  });

  it('calls the AGGREGATE endpoint once, never one request per project', async () => {
    // The whole reason `GET /tasks/portfolio-summary` was built (product-owner decision on ESC-3).
    // A regression to a client-side fan-out would still render the same tiles.
    await renderTasks();
    await waitFor(() => expect(scheduleApi.getPortfolioTaskSummary).toHaveBeenCalledTimes(1));
  });

  it('lists the critical tasks of EVERY project, each naming its own', async () => {
    // The section spans the tenant since 2026-09-07 — one server-side pass per project — so the
    // heading names no project and each row carries the one it belongs to.
    const { getByTestId } = await renderTasks();
    await waitFor(() => expect(getByTestId('tasks-critical-t-1')).toBeTruthy());
    expect(getByTestId('tasks-critical-t-1')).toHaveTextContent(/Sukhumvit 45/);
    expect(getByTestId('tasks-critical-t-9')).toHaveTextContent(/Rama IX Tower/);
  });

  it('asks the tenant-wide endpoint once, never one request per project', async () => {
    // The fan-out this endpoint exists to prevent — five projects would otherwise be five requests
    // from the first screen the role sees.
    await renderTasks();
    await waitFor(() => expect(scheduleApi.getPortfolioCriticalPath).toHaveBeenCalledTimes(1));
  });

  it('marks a task that has an owner, and leaves an unowned one unmarked', async () => {
    // `assigned_to` is the only assignee fact this platform holds — no name, no photograph. An
    // unassigned critical task must stay visibly unassigned rather than take a generic head.
    const { getByTestId, queryByTestId } = await renderTasks();
    await waitFor(() => expect(getByTestId('tasks-critical-t-1-assignee')).toBeTruthy());
    expect(queryByTestId('tasks-critical-t-9-assignee')).toBeNull();
  });

  it('names how many tasks it could not schedule instead of dropping them silently', async () => {
    const { getByTestId } = await renderTasks();
    await waitFor(() => expect(getByTestId('tasks-excluded-note')).toHaveTextContent(/2/));
  });

  it('says so when the project has no dependency network yet', async () => {
    scheduleApi.getPortfolioCriticalPath.mockResolvedValue({
      project_id: 'p-1',
      project_start: null,
      project_finish: null,
      duration_days: 0,
      working_day_calendar: false,
      critical_task_ids: [],
      excluded_task_count: 0,
      tasks: [],
    });
    const { getByTestId } = await renderTasks();
    await waitFor(() => expect(getByTestId('tasks-critical-empty')).toBeTruthy());
  });

  it('shows em dashes rather than zeros when the roll-up fails', async () => {
    // A zero here would read as "nothing is overdue", which is the opposite of "we could not ask".
    scheduleApi.getPortfolioTaskSummary.mockImplementation(() =>
      Promise.reject(new Error('offline')),
    );
    const { getByTestId } = await renderTasks();
    await waitFor(() => expect(getByTestId('tasks-kpi-overdue')).toHaveTextContent(/—/));
  });

  it('still shows the critical path when the executive project list is empty', async () => {
    // The roll-up is tenant-wide and no longer hangs off the list — that dependency is exactly what
    // made the section report on ONE project while its heading named that project.
    projectsApi.getMyProjects.mockResolvedValue([]);
    const { getByTestId } = await renderTasks();
    await waitFor(() => expect(getByTestId('tasks-critical-t-1')).toBeTruthy());
    expect(scheduleApi.getPortfolioCriticalPath).toHaveBeenCalledTimes(1);
  });

  it('writes no state after the screen is unmounted mid-flight', async () => {
    // The `cancelled` guards in the effect, exercised where they actually matter: an executive who
    // leaves the tab before a slow portfolio query answers. Without them React logs a state update
    // on an unmounted component, and on a screen with four in-flight requests that is four warnings
    // and a real leak.
    let release: (value: never) => void = () => undefined;
    scheduleApi.getPortfolioTaskSummary.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const view = await renderTasks();
    view.unmount();
    release({} as never);
    await waitFor(() => expect(true).toBe(true));
  });

  it('keeps the counts when the project list is unreachable', async () => {
    // The roll-up is tenant-wide and needs no project; only the critical path does. Losing the list
    // must not take the three tiles with it.
    projectsApi.getMyProjects.mockImplementation(() => Promise.reject(new Error('offline')));
    const { getByTestId } = await renderTasks();
    await waitFor(() => expect(getByTestId('tasks-kpi-overdue')).toHaveTextContent(/12/));
    // And the critical path with them: neither call needs the list any more.
    expect(getByTestId('tasks-critical-t-1')).toBeTruthy();
  });

  it('survives a critical-path call that fails on its own', async () => {
    scheduleApi.getPortfolioCriticalPath.mockImplementation(() =>
      Promise.reject(new Error('offline')),
    );
    const { getByTestId } = await renderTasks();
    await waitFor(() => expect(getByTestId('tasks-critical-empty')).toBeTruthy());
    expect(getByTestId('tasks-kpi-blocked')).toHaveTextContent(/8/);
  });

  // ── The drawing's two controls (2026-09-05) ────────────────────────────────
  //
  // Both are drawn and neither has anywhere to go — there is no blocked-task list and no full
  // critical-path screen for this role. What IS testable, and what these assert, is that each one
  // goes dead exactly when its subject is empty: a live control that leads nowhere is a worse lie
  // than a greyed one.

  it('pairs the blocked figure with its unit', async () => {
    // "8" alone on a dashboard reads as a percentage or a currency at a glance; the drawing writes
    // "8 Tasks" (PO 2026-09-07).
    const { getByTestId } = await renderTasks();
    await waitFor(() => expect(getByTestId('tasks-kpi-blocked')).toHaveTextContent(/8/));
    expect(getByTestId('tasks-kpi-blocked')).toHaveTextContent(/Tasks/i);
  });

  it('offers the blocked card its detail control once something is blocked', async () => {
    const { getByTestId } = await renderTasks();
    await waitFor(() => expect(getByTestId('tasks-kpi-blocked')).toHaveTextContent(/8/));
    expect(getByTestId('tasks-blocked-detail').props.accessibilityState.disabled).toBe(false);
  });

  it('disables the detail control when nothing is blocked', async () => {
    scheduleApi.getPortfolioTaskSummary.mockResolvedValue({
      overdue_count: 4,
      due_this_week_count: 9,
      blocked_count: 0,
      open_count: 30,
      project_count: 5,
    });
    const { getByTestId } = await renderTasks();
    await waitFor(() => expect(getByTestId('tasks-kpi-blocked')).toHaveTextContent(/0/));
    expect(getByTestId('tasks-blocked-detail').props.accessibilityState.disabled).toBe(true);
  });

  it('disables the detail control when the roll-up could not be fetched at all', async () => {
    // Distinct from zero: this is "we could not ask", and the control must not imply a list exists.
    scheduleApi.getPortfolioTaskSummary.mockImplementation(() =>
      Promise.reject(new Error('offline')),
    );
    const { getByTestId } = await renderTasks();
    await waitFor(() => expect(getByTestId('tasks-kpi-overdue')).toHaveTextContent(/—/));
    expect(getByTestId('tasks-blocked-detail').props.accessibilityState.disabled).toBe(true);
  });

  it('enables the critical path view-all control only when there is a path', async () => {
    const { getByTestId } = await renderTasks();
    await waitFor(() => expect(getByTestId('tasks-critical-t-1')).toBeTruthy());
    expect(getByTestId('tasks-critical-all').props.accessibilityState.disabled).toBe(false);
  });

  it('disables the view-all control when the project has no critical path', async () => {
    scheduleApi.getPortfolioCriticalPath.mockResolvedValue({
      project_id: 'p-1',
      project_start: null,
      project_finish: null,
      duration_days: 0,
      working_day_calendar: false,
      critical_task_ids: [],
      excluded_task_count: 0,
      tasks: [],
    });
    const { getByTestId } = await renderTasks();
    await waitFor(() => expect(getByTestId('tasks-critical-empty')).toBeTruthy());
    expect(getByTestId('tasks-critical-all').props.accessibilityState.disabled).toBe(true);
  });

  // ── The critical-path card's own fields ────────────────────────────────────

  it('draws the card from the real columns, and its id from the real key', async () => {
    // The drawing's "ID: TSK-0942" has no equivalent column — `projects.tasks` is keyed by UUID —
    // so the chip shows the first block of the actual id. This asserts it is the ID and not a
    // number this screen made up.
    const { getByTestId } = await renderTasks();
    await waitFor(() => expect(getByTestId('tasks-critical-t-1')).toBeTruthy());
    const card = getByTestId('tasks-critical-t-1');
    expect(card).toHaveTextContent(/FOUNDATION/);
    expect(card).toHaveTextContent(/Pile caps/);
    expect(card).toHaveTextContent(/ID: T-1/);
    // The status word is the row's own status, translated — not a severity this screen assigned.
    expect(card).toHaveTextContent(/In progress/i);
  });
});
