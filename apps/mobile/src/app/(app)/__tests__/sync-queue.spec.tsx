// Behaviour of the tenant-admin sync queue.
//
// This screen is the only place a conflict between what a phone recorded offline and what the
// server holds is resolved, so the assertions are about WHICH conflict a control acts on and when
// it may act at all. Resolving writes to the server: offline it must be inert rather than
// optimistic, because a queue that says "resolved" while nothing was sent is worse than a queue
// that says it cannot.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import SyncQueueScreen from '../sync-queue';

let mockOnline = true;
// The hook returns a NetworkStatus object, not a boolean — a mock that returns the bare boolean
// leaves `isOnline` undefined, which reads as permanently offline and quietly passes the offline
// test while breaking the online one.
jest.mock('../../../hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: mockOnline, connectionType: null }),
}));

jest.mock('../../../api/conflicts', () => ({
  ...jest.requireActual('../../../api/conflicts'),
  getConflictRecords: jest.fn(),
  resolveConflict: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../../../api/conflicts') as {
  getConflictRecords: jest.Mock;
  resolveConflict: jest.Mock;
};

function conflict(over: Partial<Record<string, unknown>> = {}) {
  return {
    conflict_id: 'c-1111-aaaa',
    entity_type: 'task',
    entity_id: 'e-1',
    conflict_type: 'FIELD_CONFLICT',
    client_payload: { status: 'DONE' },
    server_payload: { status: 'IN_PROGRESS' },
    created_at: '2026-08-19T09:00:00Z',
    ...over,
  };
}

function renderScreen() {
  return render(
    <I18nProvider>
      <SyncQueueScreen />
    </I18nProvider>,
  );
}

describe('SyncQueueScreen', () => {
  beforeEach(() => {
    mockOnline = true;
    api.getConflictRecords.mockReset();
    api.resolveConflict.mockReset();
    api.resolveConflict.mockResolvedValue(undefined);
  });

  it('renders a card per unresolved conflict', async () => {
    api.getConflictRecords.mockResolvedValue([conflict(), conflict({ conflict_id: 'c-2' })]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('conflict-c-1111-aaaa')).toBeTruthy());
    expect(getByTestId('conflict-c-2')).toBeTruthy();
  });

  it('narrows the queue to one conflict type', async () => {
    api.getConflictRecords.mockResolvedValue([
      conflict(),
      conflict({ conflict_id: 'c-2', conflict_type: 'REJECTED' }),
    ]);

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('conflict-c-2')).toBeTruthy());
    await fireEvent.press(getByTestId('sync-filter-REJECTED'));

    await waitFor(() => expect(queryByTestId('conflict-c-1111-aaaa')).toBeNull());
    expect(getByTestId('conflict-c-2')).toBeTruthy();
  });

  it('marks the filter in force as the selected one', async () => {
    api.getConflictRecords.mockResolvedValue([conflict()]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('sync-filter-ALL')).toBeTruthy());
    expect(getByTestId('sync-filter-ALL').props.accessibilityState.selected).toBe(true);

    await fireEvent.press(getByTestId('sync-filter-REJECTED'));

    await waitFor(() =>
      expect(getByTestId('sync-filter-REJECTED').props.accessibilityState.selected).toBe(true),
    );
    expect(getByTestId('sync-filter-ALL').props.accessibilityState.selected).toBe(false);
  });

  it('unfolds the diff of the conflict whose Review was pressed, and only that one', async () => {
    api.getConflictRecords.mockResolvedValue([conflict(), conflict({ conflict_id: 'c-2' })]);

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('review-c-2')).toBeTruthy());
    await fireEvent.press(getByTestId('review-c-2'));

    await waitFor(() => expect(getByTestId('diff-c-2')).toBeTruthy());
    expect(queryByTestId('diff-c-1111-aaaa')).toBeNull();
  });

  it('resolves the conflict whose button was pressed', async () => {
    api.getConflictRecords.mockResolvedValue([conflict(), conflict({ conflict_id: 'c-2' })]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('resolve-c-2')).toBeTruthy());
    await fireEvent.press(getByTestId('resolve-c-2'));

    await waitFor(() => expect(api.resolveConflict).toHaveBeenCalledWith('c-2'));
  });

  // Offline the write cannot be made, so the control says so rather than pretending.
  it('will not resolve while offline', async () => {
    mockOnline = false;
    api.getConflictRecords.mockResolvedValue([conflict()]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('sync-queue-online-only')).toBeTruthy());
    expect(getByTestId('resolve-c-1111-aaaa').props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(getByTestId('resolve-c-1111-aaaa'));

    expect(api.resolveConflict).not.toHaveBeenCalled();
  });

  it('shows the empty state when nothing is in conflict', async () => {
    api.getConflictRecords.mockResolvedValue([]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('sync-queue-empty')).toBeTruthy());
  });

  it('keeps the screen usable when the request fails', async () => {
    api.getConflictRecords.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('sync-queue-error')).toBeTruthy());
  });
});
