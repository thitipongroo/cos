// Behaviour of the daily site report.
//
// This is an OFFLINE-FIRST create: the row is written locally and a sync item is enqueued, and the
// server sees it whenever the phone next has signal. So the assertions are about what is enqueued,
// not about a request — there is no request to observe.
//
// Two rules are worth naming. `blocker_category` is REQUIRED even on a clear day (OTHER is what a
// clear day is filed as), because "no category" otherwise means both "nothing blocked us" and
// "nobody said", which is what made the reports list unreadable. And a second save is a NEW report,
// not an edit of the one already sent — the client id is the server's idempotency key (ADR-051), so
// reusing it would make the second save overwrite the first.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import { useProjectStore } from '../../../store/projectStore';
import ReportScreen from '../report';

const mockInsert = jest.fn();
jest.mock('../../../db/database', () => ({
  ...jest.requireActual('../../../db/database'),
  db: { insert: () => ({ values: mockInsert }) },
  newLocalId: () => 'local-1',
}));
jest.mock('../../../db/sync-queue', () => ({ enqueue: jest.fn() }));
// <PhotoCapture /> runs a live query over local_photos and mounts a Skia canvas for annotation.
// Neither is what this screen's rules are, and stubbing it keeps the db mock above to the one
// method the report itself uses.
jest.mock('../../../components/PhotoCapture', () => ({ PhotoCapture: () => null }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const queue = require('../../../db/sync-queue') as { enqueue: jest.Mock };

const PROJECT_ID = 'proj-1';

function renderScreen() {
  return render(
    <I18nProvider>
      <ReportScreen />
    </I18nProvider>,
  );
}

describe('ReportScreen', () => {
  beforeEach(() => {
    mockInsert.mockReset();
    mockInsert.mockResolvedValue(undefined);
    queue.enqueue.mockReset();
    useProjectStore.setState({
      active: { projectId: PROJECT_ID, projectName: 'Riverside Tower' },
    } as never);
  });

  it('opens with the save actions off until a blocker category is chosen', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('save-report-button').props.accessibilityState.disabled).toBe(true);
    expect(getByTestId('save-draft-button').props.accessibilityState.disabled).toBe(true);
  });

  // A clear day is filed as OTHER — see the note at the top of this file.
  it('turns the save actions on once a category is chosen', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('blocker-category-OTHER'));

    await waitFor(() =>
      expect(getByTestId('save-report-button').props.accessibilityState.disabled).toBe(false),
    );
  });

  it('will not save without a project', async () => {
    useProjectStore.setState({ active: null } as never);

    const { getByTestId } = await renderScreen();
    await fireEvent.press(getByTestId('blocker-category-OTHER'));
    await fireEvent.press(getByTestId('save-report-button'));

    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('enqueues the report for push rather than posting it', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('blocker-category-WEATHER'));
    await fireEvent.press(getByTestId('save-report-button'));

    await waitFor(() => expect(queue.enqueue).toHaveBeenCalledTimes(1));
    const [kind, , op, payload] = queue.enqueue.mock.calls[0];
    expect(kind).toBe('site_report');
    expect(op).toBe('CREATE');
    expect(payload.project_id).toBe(PROJECT_ID);
    expect(payload.blocker_category).toBe('WEATHER');
  });

  it('writes the row locally so the report survives being offline', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('blocker-category-OTHER'));
    await fireEvent.press(getByTestId('save-report-button'));

    await waitFor(() => expect(mockInsert).toHaveBeenCalledTimes(1));
    expect(mockInsert.mock.calls[0][0].offlineSyncStatus).toBe('PENDING');
    expect(mockInsert.mock.calls[0][0].status).toBe('SUBMITTED');
  });

  it('files a draft as a draft', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('blocker-category-OTHER'));
    await fireEvent.press(getByTestId('save-draft-button'));

    await waitFor(() => expect(mockInsert).toHaveBeenCalledTimes(1));
    expect(mockInsert.mock.calls[0][0].status).toBe('DRAFT');
  });

  // ADR-051: the client id IS the server's idempotency key. A second save must not reuse it, or it
  // overwrites the report already sent instead of filing a new one.
  it('files a second save as a NEW report, not an edit of the first', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('blocker-category-OTHER'));
    await fireEvent.press(getByTestId('save-report-button'));
    await waitFor(() => expect(queue.enqueue).toHaveBeenCalledTimes(1));

    await fireEvent.press(getByTestId('save-report-button'));
    await waitFor(() => expect(queue.enqueue).toHaveBeenCalledTimes(2));

    const first = queue.enqueue.mock.calls[0][1] as string;
    const second = queue.enqueue.mock.calls[1][1] as string;
    expect(second).not.toBe(first);
  });

  it('carries the manpower breakdown as one line per trade that has workers', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('blocker-category-OTHER'));
    await fireEvent.press(getByTestId('manpower-increment'));
    await fireEvent.press(getByTestId('trade-STRUCTURAL-increment'));
    await fireEvent.press(getByTestId('save-report-button'));

    await waitFor(() => expect(queue.enqueue).toHaveBeenCalledTimes(1));
    const payload = queue.enqueue.mock.calls[0][3];
    expect(payload.manpower_lines).toEqual([{ trade_type: 'STRUCTURAL', worker_count: 1 }]);
  });

  it('leaves the breakdown out when no trade has workers', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('blocker-category-OTHER'));
    await fireEvent.press(getByTestId('save-report-button'));

    await waitFor(() => expect(queue.enqueue).toHaveBeenCalledTimes(1));
    expect(queue.enqueue.mock.calls[0][3].manpower_lines).toBeUndefined();
  });

  it('says the report was saved', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('blocker-category-OTHER'));
    await fireEvent.press(getByTestId('save-report-button'));

    await waitFor(() => expect(getByTestId('report-saved')).toBeTruthy());
  });
});
