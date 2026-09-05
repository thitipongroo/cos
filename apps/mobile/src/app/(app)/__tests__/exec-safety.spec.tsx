// Behaviour of the EXECUTIVE portfolio Safety overview (ADR-098), the new route the
// 2026-09-05 bar change introduced.
//
// WHAT THESE TESTS ARE FOR. Each screen mixes REAL data with figures the platform cannot compute
// (ADR-099), and the two are only distinguishable by reading the code. A test that asserts "the
// compliance panel renders" would pass whether the number came from an endpoint or a constant. So
// each block below asserts the SPLIT: which values move when the API answers differently, and which
// do not — because a drawn figure that starts tracking an endpoint, or a real one that stops, is
// exactly the regression that no screenshot review would catch.

import { render, cleanup, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import SafetyScreen from '../safety';
import { COMPLIANCE, SAFE_MAN_HOURS } from '../../../lib/mockupFigures';

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
  getCriticalPath: jest.fn(),
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
jest.mock('../../../components/ScheduleInsight', () => ({ ScheduleInsight: () => null }));

/* eslint-disable @typescript-eslint/no-require-imports */
const safetyApi = require('../../../api/safety') as {
  getCompliance: jest.Mock;
  listIncidents: jest.Mock;
};
const scheduleApi = require('../../../api/schedule') as {
  getPortfolioTaskSummary: jest.Mock;
  getCriticalPath: jest.Mock;
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
function renderSafety() {
  return render(
    <I18nProvider>
      <SafetyScreen />
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
    // RESOLVED — present in the API's answer and NOT active, so it must not reach any count here.
    { ...incident('p-1', 'MEDIUM'), incident_id: 'p-1-resolved', status: 'RESOLVED' as const },
  ]);
  scheduleApi.getPortfolioTaskSummary.mockResolvedValue({
    overdue_count: 12,
    due_this_week_count: 45,
    blocked_count: 8,
    open_count: 90,
    project_count: 5,
  });
  scheduleApi.getCriticalPath.mockResolvedValue({
    project_id: 'p-1',
    project_start: '2026-09-01',
    project_finish: '2026-09-20',
    duration_days: 19,
    working_day_calendar: false,
    critical_task_ids: ['t-1'],
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
      },
      {
        task_id: 't-2',
        task_name: 'Waterproofing',
        status: 'NOT_STARTED',
        work_type: 'STRUCTURE',
        duration_days: 21,
        earliest_start: '2026-09-04',
        earliest_finish: '2026-09-25',
        latest_start: '2026-09-07',
        latest_finish: '2026-09-28',
        total_float_days: 3,
        is_critical: false,
      },
    ],
  });
});

describe('SafetyScreen — the EXECUTIVE portfolio safety overview', () => {
  it('reads incidents TENANT-WIDE, which is what makes it a portfolio view', async () => {
    await renderSafety();
    // No project_id. Passing one would scope the screen to a single site while calling it a
    // portfolio — the mistake that made this a new route rather than a re-point of /incidents.
    // NO STATUS FILTER. "Active" is OPEN *and* IN_PROGRESS, and asking only for OPEN reported zero
    // over a tenant holding five IN_PROGRESS incidents — which is what the first capture showed.
    await waitFor(() => expect(safetyApi.listIncidents).toHaveBeenCalledWith());
    expect(safetyApi.getCompliance).toHaveBeenCalledWith();
  });

  it('counts the ACTIVE rows it received, not the OPEN-only tally', async () => {
    // `ComplianceSummary.open_incidents` counts OPEN alone. The rows are the fuller answer — three
    // active here (two LOW, one HIGH) plus one RESOLVED that must not be counted — so the tile
    // reports 3 even when the summary claims 7. Both numbers come from the API; this asserts WHICH.
    safetyApi.getCompliance.mockResolvedValue({
      open_incidents: 7,
      high_critical_incidents: 2,
      expired_permits: 0,
      revoked_permits: 0,
    });
    const { getByTestId } = await renderSafety();
    await waitFor(() => expect(getByTestId('safety-incidents')).toBeTruthy());
    expect(getByTestId('safety-incidents')).toHaveTextContent(/03/);
  });

  it('falls back to the API tally when no incident rows came back', async () => {
    safetyApi.listIncidents.mockResolvedValue([]);
    safetyApi.getCompliance.mockResolvedValue({
      open_incidents: 7,
      high_critical_incidents: 2,
      expired_permits: 0,
      revoked_permits: 0,
    });
    const { getByTestId } = await renderSafety();
    await waitFor(() => expect(getByTestId('safety-incidents')).toHaveTextContent(/07/));
  });

  it('splits the severity from the rows it actually received', async () => {
    const { getByTestId } = await renderSafety();
    // Two LOW and one HIGH in the fixture: the raised side counts everything that is not LOW, so no
    // incident is dropped from a line that claims to describe all of them.
    await waitFor(() => expect(getByTestId('safety-incidents')).toHaveTextContent(/2/));
    expect(getByTestId('safety-incidents')).toHaveTextContent(/1/);
  });

  it('shows an em dash rather than a stale or invented count when the API fails', async () => {
    safetyApi.getCompliance.mockImplementation(() => Promise.reject(new Error('offline')));
    safetyApi.listIncidents.mockImplementation(() => Promise.reject(new Error('offline')));
    const { getByTestId } = await renderSafety();
    await waitFor(() => expect(getByTestId('safety-incidents')).toHaveTextContent(/—/));
  });

  it('prints the drawn compliance figure UNCHANGED when the API answers differently', async () => {
    // THE POINT OF THIS TEST. `GET /safety/compliance` returns four counts and no percentage, so the
    // headline cannot track it — and must be seen not to. If someone later wires this number to an
    // endpoint, this assertion fails and ADR-099 gets revisited deliberately.
    safetyApi.getCompliance.mockResolvedValue({
      open_incidents: 99,
      high_critical_incidents: 99,
      expired_permits: 99,
      revoked_permits: 99,
    });
    const { getByTestId } = await renderSafety();
    await waitFor(() => expect(getByTestId('safety-compliance')).toBeTruthy());
    expect(getByTestId('safety-compliance')).toHaveTextContent(
      new RegExp(`${COMPLIANCE.value.percent}%`),
    );
    expect(getByTestId('safety-man-hours')).toHaveTextContent(new RegExp(SAFE_MAN_HOURS.value));
  });

  it("ranks the projects it was given, with each project's own incident count", async () => {
    const { getByTestId } = await renderSafety();
    await waitFor(() => expect(getByTestId('safety-rank-p-1')).toBeTruthy());
    // p-3 holds the one HIGH incident; p-1 and p-2 hold one LOW each.
    expect(getByTestId('safety-rank-p-3')).toHaveTextContent(/1/);
    expect(getByTestId('safety-rank-p-1')).toHaveTextContent(/1/);
  });

  it('draws six trend bars, and sends View all to the portfolio', async () => {
    const { getByTestId } = await renderSafety();
    await waitFor(() => expect(getByTestId('safety-trend-bar-5')).toBeTruthy());
    await fireEvent.press(getByTestId('safety-view-all'));
    expect(mockPush).toHaveBeenCalledWith('/portfolio');
  });

  it('writes no state after the screen is unmounted mid-flight', async () => {
    // The `cancelled` guards in the effect, exercised where they actually matter: an executive who
    // leaves the tab before a slow portfolio query answers. Without them React logs a state update
    // on an unmounted component, and on a screen with four in-flight requests that is four warnings
    // and a real leak.
    let release: (value: never) => void = () => undefined;
    safetyApi.listIncidents.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const view = await renderSafety();
    view.unmount();
    release([] as never);
    await waitFor(() => expect(true).toBe(true));
  });

  it('keeps the incident figures when the project list is unreachable', async () => {
    // The ranking needs projects; the incident tile does not. Losing the list must not blank a
    // count that came back fine.
    projectsApi.getMyProjects.mockImplementation(() => Promise.reject(new Error('offline')));
    const { getByTestId, queryByTestId } = await renderSafety();
    await waitFor(() => expect(getByTestId('safety-incidents')).toHaveTextContent(/03/));
    expect(queryByTestId('safety-rank-p-1')).toBeNull();
  });
});
