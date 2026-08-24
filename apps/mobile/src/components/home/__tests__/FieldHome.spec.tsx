// Behaviour of the Site Worker's Home.
//
// BOTH FIGURES ARE COUNTED FROM THE LOCAL DATABASE, NEVER FETCHED. This is the screen a worker opens
// standing on a site with no signal, so a tile that needed the network would be blank exactly when
// it is read (§17.4).
//
// A DASH, NOT "00:00", FOR A SHIFT NOT STARTED. A zero reads as a shift that has just begun, which
// is a different thing from having not checked in — and on this tile the difference is whether
// someone is on the clock.
//
// THE HEADING IS A LINK, and that is not decoration. Moving the quick actions behind the FAB took
// the Tasks tile off this screen, and the mockup's only other route to the full list is "+ N more
// scheduled" — which does not render when there are no tasks at all, leaving /tasks unreachable in
// exactly the state a new worker starts in.
//
// AND THE CARD IS THE SAME <TaskCard /> THE TASKS SCREEN RENDERS, with the same swipe-to-complete:
// one card must not behave differently depending on which screen it was rendered from.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { I18nProvider } from '../../../i18n';
import FieldHome from '../FieldHome';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

const mockMutate = jest.fn();
jest.mock('../../../api/client', () => ({
  mutate: (...args: unknown[]) => mockMutate(...args),
  get: jest.fn(),
}));

const mockUpdateSet = jest.fn();
// Mocked WHOLE, without requireActual: the real module opens a SQLite handle and runs its DDL at
// import time. Only the update chain this screen reaches for is needed.
jest.mock('../../../db/database', () => ({
  db: {
    update: () => ({
      set: (values: unknown) => ({ where: () => mockUpdateSet(values) }),
    }),
  },
}));

let mockTasks: unknown[] = [];
let mockAttendance: unknown[] = [];
jest.mock('../../../hooks/useCollection', () => ({
  useCollection: (table: string) => (table === 'local_tasks' ? mockTasks : mockAttendance),
}));

jest.mock('../../../hooks/useSyncStatus', () => ({ useSyncStatus: () => 'idle' }));
jest.mock('../../../hooks/usePendingCount', () => ({ usePendingCount: () => 0 }));

function task(over: Record<string, unknown> = {}) {
  return {
    id: 'local-1',
    taskId: 't-1',
    projectId: 'proj-1',
    taskName: 'Pour slab level 4',
    status: 'IN_PROGRESS',
    progressPercent: 40,
    assignedTo: null,
    workType: 'STRUCTURE',
    plannedStart: null,
    plannedEnd: null,
    plannedStartTime: null,
    plannedEndTime: null,
    offlineSyncStatus: 'SYNCED',
    ...over,
  };
}

/**
 * An open shift that began `hoursAgo` hours ago — CLAMPED TO TODAY.
 *
 * `shiftProgress` only counts a check-in on the SAME LOCAL DAY, so a naive `Date.now() - 3h` is a
 * test that fails between midnight and 03:00 and passes the rest of the day. It did: this spec was
 * written in the afternoon and broke at 00:04 the next morning, which is the worst kind of test —
 * red for a reason that has nothing to do with the code, on the shift this app is most used on.
 *
 * Clamping to the later of "today at 00:00" and "n hours ago" keeps the check-in inside today and
 * never in the future, whatever hour the suite runs at.
 */
function checkedIn(hoursAgo: number) {
  const now = Date.now();
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  return {
    id: 'att-1',
    checkInAt: new Date(Math.max(startOfToday, now - hoursAgo * 3_600_000)).toISOString(),
    checkOutAt: null,
  };
}

function renderHome() {
  return render(
    <I18nProvider>
      <FieldHome />
    </I18nProvider>,
  );
}

describe('FieldHome', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockMutate.mockReset().mockResolvedValue(undefined);
    mockUpdateSet.mockReset().mockResolvedValue(undefined);
    mockTasks = [];
    mockAttendance = [];
  });

  it('renders the worker home', async () => {
    const { getByTestId } = await renderHome();

    expect(getByTestId('home-screen')).toBeTruthy();
    expect(getByTestId('stat-my-tasks')).toBeTruthy();
    expect(getByTestId('stat-shift-hours')).toBeTruthy();
  });

  // ── MY TASKS ─────────────────────────────────────────────────────────────────────────────────

  it('counts what is done out of what there is', async () => {
    mockTasks = [
      task({ id: 'a', status: 'COMPLETED', progressPercent: 100 }),
      task({ id: 'b' }),
      task({ id: 'c' }),
    ];

    const { getByTestId } = await renderHome();

    expect(within(getByTestId('stat-my-tasks'))).toContain('1');
    expect(within(getByTestId('stat-my-tasks'))).toContain('3');
  });

  // A task at 100% is done whatever its status column says — the bar is what a worker reads, and a
  // row finished offline may not have had its status written yet.
  it('counts a task at 100% as done even without the status', async () => {
    mockTasks = [task({ id: 'a', status: 'IN_PROGRESS', progressPercent: 100 })];

    const { getByTestId } = await renderHome();

    expect(within(getByTestId('stat-my-tasks'))).toContain('1');
  });

  // No tasks at all is a real state on day one; the tile must not divide by nothing.
  it('survives having no tasks at all', async () => {
    const { getByTestId } = await renderHome();

    expect(getByTestId('stat-my-tasks')).toBeTruthy();
    expect(getByTestId('home-no-tasks')).toBeTruthy();
  });

  // ── SHIFT HOURS ──────────────────────────────────────────────────────────────────────────────

  // A zero would read as a shift that has just started. Not checked in is a different fact.
  it('shows a dash when nobody has checked in', async () => {
    const { getByTestId } = await renderHome();

    expect(within(getByTestId('stat-shift-hours'))).toContain('—');
    expect(within(getByTestId('stat-shift-hours'))).not.toContain('00:00');
  });

  it('shows the elapsed shift once someone has', async () => {
    mockAttendance = [checkedIn(3)];

    const { getByTestId } = await renderHome();

    expect(within(getByTestId('stat-shift-hours'))).not.toContain('—');
  });

  // A shift that was closed is not a shift in progress — the tile is about being on the clock now.
  it('shows a dash again once the shift is closed', async () => {
    mockAttendance = [{ ...checkedIn(3), checkOutAt: new Date().toISOString() }];

    const { getByTestId } = await renderHome();

    expect(within(getByTestId('stat-shift-hours'))).toContain('—');
  });

  // ── PRIORITY TASKS ───────────────────────────────────────────────────────────────────────────

  // UNFINISHED FIRST — a finished task is not a priority — and only three, because the mockup lists
  // three and then counts the rest.
  it('lists the three unfinished tasks, not the first three rows', async () => {
    mockTasks = [
      task({ id: 'done', taskId: 't-done', status: 'COMPLETED', progressPercent: 100 }),
      task({ id: 'a', taskId: 't-a' }),
      task({ id: 'b', taskId: 't-b' }),
      task({ id: 'c', taskId: 't-c' }),
    ];

    const { getByTestId, queryByTestId } = await renderHome();

    expect(getByTestId('task-t-a')).toBeTruthy();
    expect(getByTestId('task-t-c')).toBeTruthy();
    expect(queryByTestId('task-t-done')).toBeNull();
  });

  it('counts the rest rather than listing them', async () => {
    mockTasks = ['a', 'b', 'c', 'd', 'e'].map((id) => task({ id, taskId: `t-${id}` }));

    const { getByTestId, queryByTestId } = await renderHome();

    expect(getByTestId('home-more-tasks')).toBeTruthy();
    expect(queryByTestId('task-t-d')).toBeNull();
  });

  // No "+ 0 more": a control offering nothing is worse than none, because it is tapped once.
  it('offers no more-tasks control when there is no rest', async () => {
    mockTasks = [task({ id: 'a', taskId: 't-a' })];

    const { queryByTestId } = await renderHome();

    expect(queryByTestId('home-more-tasks')).toBeNull();
  });

  // THE STATE A NEW WORKER STARTS IN. With no tasks the "+ N more" control does not render, so
  // without this link /tasks would be unreachable from this screen entirely.
  it('reaches the task list from the heading, even with nothing listed', async () => {
    const { getByTestId } = await renderHome();

    expect(getByTestId('home-no-tasks')).toBeTruthy();

    await fireEvent.press(getByTestId('home-tasks-link'));

    expect(mockPush).toHaveBeenCalledWith('/tasks');
  });

  it('reaches the task list from the rest-count too', async () => {
    mockTasks = ['a', 'b', 'c', 'd'].map((id) => task({ id, taskId: `t-${id}` }));

    const { getByTestId } = await renderHome();

    await fireEvent.press(getByTestId('home-more-tasks'));

    expect(mockPush).toHaveBeenCalledWith('/tasks');
  });

  it('opens the task list from a card', async () => {
    mockTasks = [task({ id: 'a', taskId: 't-a' })];

    const { getByTestId } = await renderHome();

    await fireEvent.press(getByTestId('task-t-a'));

    expect(mockPush).toHaveBeenCalledWith('/tasks');
  });

  // ── COMPLETING FROM HERE ─────────────────────────────────────────────────────────────────────

  // THE LOCAL WRITE LANDS FIRST, then the PATCH queues: the worker is offline as often as not, and
  // the row has to read as done on their own device immediately. The server resolves with Max-wins
  // (§17.5, monotonic), so a later sync cannot walk the progress backwards.
  it('writes the completion locally and queues the change', async () => {
    mockTasks = [task({ id: 'a', taskId: 't-a' })];

    const { getByTestId } = await renderHome();

    await fireEvent(getByTestId('task-t-a').parent!, 'swipeableOpen', 'left', { close: () => {} });

    await waitFor(() => expect(mockUpdateSet).toHaveBeenCalledTimes(1));
    expect(mockUpdateSet.mock.calls[0][0]).toMatchObject({
      progressPercent: 100,
      offlineSyncStatus: 'PENDING',
    });
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
    expect(mockMutate).toHaveBeenCalledWith(
      'PATCH',
      '/tasks/t-a',
      { progress_percent: 100 },
      'task',
      't-a',
    );
  });

  // ── THE AI INSIGHT ───────────────────────────────────────────────────────────────────────────

  // Nothing is behind it: the weather projection has no source in this product, and §22.3 puts
  // schedule generation behind Temporal with a human-in-the-loop step. So ADJUST SCHEDULE reports
  // that it is unavailable rather than acting — and nothing on this screen reads the panel.
  it('says the schedule adjustment is unavailable rather than acting on it', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { getByTestId } = await renderHome();

    await fireEvent.press(getByTestId('home-insight-action'));

    expect(alert).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockMutate).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  // ── THE FAB ──────────────────────────────────────────────────────────────────────────────────

  // An OVERLAY, not a route (2026-08-09): the menu it opens heads its own surface with a bar and a
  // close button, and a pushed route would get the shared TopBar's back chevron instead — two
  // different ways out of one sheet.
  it('opens the quick actions as an overlay, closed until then', async () => {
    const { getByTestId, queryByTestId } = await renderHome();

    expect(queryByTestId('quick-actions-screen')).toBeNull();

    await fireEvent.press(getByTestId('home-quick-action-fab'));

    expect(getByTestId('quick-actions-screen')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

/** A tile's own text, joined — the figure and its unit are separate children. */
function within(node: { props: Record<string, unknown> }): string {
  const walk = (n: unknown): string[] => {
    if (typeof n === 'string' || typeof n === 'number') return [String(n)];
    if (!n || typeof n !== 'object') return [];
    const el = n as { props?: { children?: unknown } };
    return [el.props?.children].flat(4).flatMap(walk);
  };
  return walk({ props: node.props }).join(' ');
}
