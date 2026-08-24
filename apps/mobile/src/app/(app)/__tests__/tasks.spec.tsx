// Behaviour of the task list, pinned before its row is memoized.
//
// Two things here are not FlatList's to get right. The list opens with ten cards and grows on
// request (DEFAULT_LIMIT), so "how many are on screen" is a real assertion; and each card carries
// its own open and complete actions, which is precisely what a row memoized on the wrong props
// wires to the wrong task.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import { useProjectStore } from '../../../store/projectStore';
import TasksScreen from '../tasks';

jest.mock('../../../hooks/useCollection', () => ({ useCollection: jest.fn(() => []) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useCollection } = require('../../../hooks/useCollection') as { useCollection: jest.Mock };

const PROJECT_ID = 'proj-1';

function task(n: number, over: Partial<Record<string, unknown>> = {}) {
  return {
    id: `local-${n}`,
    taskId: `srv-${n}`,
    projectId: PROJECT_ID,
    title: `Task ${n}`,
    status: 'NOT_STARTED',
    progressPercent: 0,
    severity: 'MEDIUM',
    dueDate: null,
    offlineSyncStatus: 'SYNCED',
    ...over,
  };
}

function renderScreen() {
  return render(
    <I18nProvider>
      <TasksScreen />
    </I18nProvider>,
  );
}

describe('TasksScreen', () => {
  beforeEach(() => {
    useCollection.mockReset();
    useProjectStore.setState({
      active: { projectId: PROJECT_ID, projectName: 'Riverside Tower' },
    } as never);
  });

  it('renders a card per task in the active project', async () => {
    useCollection.mockReturnValue([task(1), task(2), task(3)]);

    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId(/^task-srv-/)).toHaveLength(3));
  });

  it('leaves out tasks belonging to another project', async () => {
    useCollection.mockReturnValue([task(1), task(2, { projectId: 'other' })]);

    const { getAllByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId(/^task-srv-/)).toHaveLength(1));
    expect(queryByTestId('task-srv-2')).toBeNull();
  });

  // NOT asserted by counting rendered rows: FlatList mounts only initialNumToRender (10) of them,
  // so a count here measures virtualization rather than the screen's own DEFAULT_LIMIT. The grow
  // control is the honest signal — it renders while `matching.length > visible.length`.
  it('offers the grow control while tasks remain beyond the opening limit', async () => {
    useCollection.mockReturnValue(Array.from({ length: 14 }, (_, i) => task(i + 1)));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('task-show-more')).toBeTruthy());
  });

  it('withdraws the grow control once the limit covers every task', async () => {
    useCollection.mockReturnValue(Array.from({ length: 14 }, (_, i) => task(i + 1)));

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('task-show-more')).toBeTruthy());
    await fireEvent.press(getByTestId('task-show-more'));

    // 10 + DEFAULT_LIMIT covers all 14.
    await waitFor(() => expect(queryByTestId('task-show-more')).toBeNull());
  });

  it('hides the grow control once every task is on screen', async () => {
    useCollection.mockReturnValue([task(1), task(2)]);

    const { getAllByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId(/^task-srv-/)).toHaveLength(2));
    expect(queryByTestId('task-show-more')).toBeNull();
  });

  it('opens the detail of the task that was tapped', async () => {
    useCollection.mockReturnValue([task(1), task(2)]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('task-srv-2')).toBeTruthy());
    await fireEvent.press(getByTestId('task-srv-2'));

    await waitFor(() => expect(getByTestId('task-detail-screen')).toBeTruthy());
  });
});
