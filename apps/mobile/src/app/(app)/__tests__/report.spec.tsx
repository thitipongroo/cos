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

  // The form always opens blank — it does not load the day's report — so a blank field the user never
  // touched is left out, and the server keeps what an earlier save (or the web) stored for the day.
  it('leaves untouched blank fields out, so a later save does not erase them', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('blocker-category-OTHER'));
    await fireEvent.press(getByTestId('save-report-button'));

    await waitFor(() => expect(queue.enqueue).toHaveBeenCalledTimes(1));
    const sent = JSON.parse(JSON.stringify(queue.enqueue.mock.calls[0][3])) as Record<
      string,
      unknown
    >;
    expect(sent).not.toHaveProperty('manpower_count');
    expect(sent).not.toHaveProperty('manpower_lines');
    expect(sent).not.toHaveProperty('blockers');
  });

  // A field the user emptied is sent as null / [] — JSON keeps those, and the server writes them, so
  // the earlier save's value is cleared. (Left out, it was kept: emptying a field never reached it.)
  it('sends fields the user cleared as null / [], surviving JSON', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('blocker-category-OTHER'));
    await fireEvent.press(getByTestId('manpower-increment'));
    await fireEvent.press(getByTestId('trade-STRUCTURAL-increment'));
    await fireEvent.press(getByTestId('trade-STRUCTURAL-decrement'));
    await fireEvent.press(getByTestId('manpower-decrement'));
    await fireEvent.changeText(getByTestId('report-blockers-input'), 'rain');
    await fireEvent.changeText(getByTestId('report-blockers-input'), '  ');
    await fireEvent.press(getByTestId('save-report-button'));

    await waitFor(() => expect(queue.enqueue).toHaveBeenCalledTimes(1));
    const sent = JSON.parse(JSON.stringify(queue.enqueue.mock.calls[0][3])) as Record<
      string,
      unknown
    >;
    expect(sent).toEqual(
      expect.objectContaining({ manpower_count: null, blockers: null, manpower_lines: [] }),
    );
  });

  // With the headcount back at 0 the breakdown panel is disabled; lines still held in its state must
  // not be written next to a cleared headcount.
  it('sends no lines when the headcount was taken back to 0', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('blocker-category-OTHER'));
    await fireEvent.press(getByTestId('manpower-increment'));
    await fireEvent.press(getByTestId('trade-STRUCTURAL-increment'));
    await fireEvent.press(getByTestId('manpower-decrement'));
    await fireEvent.press(getByTestId('save-report-button'));

    await waitFor(() => expect(queue.enqueue).toHaveBeenCalledTimes(1));
    const payload = queue.enqueue.mock.calls[0][3] as Record<string, unknown>;
    expect(payload['manpower_count']).toBeNull();
    expect(payload['manpower_lines']).toEqual([]);
  });

  // The report is dated by the LOCAL calendar. At 00:30 local the UTC date is the previous day
  // anywhere east of Greenwich (Bangkok is UTC+7, so until 07:00); `toISOString()` dated the report
  // the day before, and since a report is one per (project, day, submitter) it edited that day's.
  // Only Date is faked: the render needs real timers. It can only FAIL against a UTC date east of
  // Greenwich, which is why jest.render.config.ts pins TZ to Asia/Bangkok.
  it('dates the report by the local day, not the UTC day', async () => {
    jest.useFakeTimers({
      now: new Date(2026, 7, 13, 0, 30),
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    });
    try {
      const { getByTestId } = await renderScreen();

      await fireEvent.press(getByTestId('blocker-category-OTHER'));
      await fireEvent.press(getByTestId('save-report-button'));

      await waitFor(() => expect(queue.enqueue).toHaveBeenCalledTimes(1));
      expect(queue.enqueue.mock.calls[0][3].report_date).toBe('2026-08-13');
      expect(mockInsert.mock.calls[0][0].reportDate).toBe('2026-08-13');
    } finally {
      jest.useRealTimers();
    }
  });

  it('says the report was saved', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('blocker-category-OTHER'));
    await fireEvent.press(getByTestId('save-report-button'));

    await waitFor(() => expect(getByTestId('report-saved')).toBeTruthy());
  });
});
