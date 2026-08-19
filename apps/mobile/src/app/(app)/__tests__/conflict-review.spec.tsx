// Behaviour of the SITE_ENGINEER conflict-review list, pinned before the row-memoization refactor.
//
// The expandable diff is the part at risk: `open` derives from screen-level state (openId) and the
// diff itself is computed per row only while open. A row memoized on the wrong props keeps showing
// the previous answer, which on this screen means showing one conflict's diff under another's title.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import ConflictReviewScreen from '../conflict-review';

jest.mock('../../../api/client', () => ({ get: jest.fn(), mutate: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as { get: jest.Mock; mutate: jest.Mock };

const RECORD_A = {
  conflict_id: 'c-1',
  entity_type: 'site_report',
  conflict_type: 'FIELD_CONFLICT',
  client_payload: { summary: 'client text', manpower_count: 12 },
  server_payload: { summary: 'server text', manpower_count: 12 },
};

const RECORD_B = {
  conflict_id: 'c-2',
  entity_type: 'issue',
  conflict_type: 'STATUS_CONFLICT',
  client_payload: { status: 'OPEN' },
  server_payload: { status: 'RESOLVED' },
};

function renderScreen() {
  return render(
    <I18nProvider>
      <ConflictReviewScreen />
    </I18nProvider>,
  );
}

describe('ConflictReviewScreen', () => {
  beforeEach(() => {
    client.get.mockReset();
    client.mutate.mockReset();
    client.mutate.mockResolvedValue(undefined);
  });

  it('renders one row per unresolved conflict', async () => {
    client.get.mockResolvedValue({ items: [RECORD_A, RECORD_B] });

    const { getAllByTestId, getByText } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('conflict-record-item')).toHaveLength(2));
    expect(getByText('site_report')).toBeTruthy();
    expect(getByText('issue')).toBeTruthy();
  });

  it('reveals the client/server diff for the row that was tapped, and only that row', async () => {
    client.get.mockResolvedValue({ items: [RECORD_A, RECORD_B] });

    const { getByText, queryAllByTestId, getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('conflict-record-item')).toHaveLength(2));
    expect(queryAllByTestId('conflict-diff')).toHaveLength(0);

    await fireEvent.press(getByText('site_report'));

    await waitFor(() => expect(getAllByTestId('conflict-diff')).toHaveLength(1));
    // The diff belongs to RECORD_A: its differing field is `summary`, not `status`.
    expect(getByText('client text')).toBeTruthy();
    expect(getByText('server text')).toBeTruthy();
  });

  it('collapses the diff on a second tap', async () => {
    client.get.mockResolvedValue({ items: [RECORD_A] });

    const { getByText, queryAllByTestId, getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('conflict-record-item')).toHaveLength(1));
    await fireEvent.press(getByText('site_report'));
    await waitFor(() => expect(getAllByTestId('conflict-diff')).toHaveLength(1));

    await fireEvent.press(getByText('site_report'));
    await waitFor(() => expect(queryAllByTestId('conflict-diff')).toHaveLength(0));
  });

  it('renders the screen with no rows when the request fails offline', async () => {
    client.get.mockRejectedValue(new Error('offline'));

    const { getByTestId, queryAllByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('conflict-review-screen')).toBeTruthy());
    expect(queryAllByTestId('conflict-record-item')).toHaveLength(0);
  });
});
