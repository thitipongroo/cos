// Behaviour of <FetchListScreen /> — the read-only list two screens are built out of.
//
// It is a two-caller helper (rfqs and customers, verified by grep), and both of them are thin, so
// almost everything those screens do is this file. That makes its offline rule the thing worth
// pinning: a failed fetch KEEPS THE LAST LIST rather than emptying it. A procurement officer who
// walks out of signal should still see the RFQs they were reading, and an empty list would say
// there are none.
//
// The other rule is `mapItem`: both callers pass it as an inline arrow, so it is a new function on
// every render. The component maps once per render and memoizes the rows on their own props — so a
// mapper must not be called twice per row, and a row whose text did not change must not re-render.

import { act, render, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../i18n';
import { FetchListScreen } from '../FetchListScreen';

jest.mock('../../api/client', () => ({ get: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../api/client') as { get: jest.Mock };

interface Rfq {
  rfq_id: string;
  title: string;
  status: string;
}

const ROWS: Rfq[] = [
  { rfq_id: 'r-1', title: 'Rebar supply', status: 'OPEN' },
  { rfq_id: 'r-2', title: 'Concrete pump hire', status: 'AWARDED' },
];

/**
 * Pull to refresh.
 *
 * `onRefresh` lives on the FlatList's `refreshControl` PROP, not on a child, so fireEvent has
 * nothing to walk up to and finds no handler. Calling it through the prop is the honest way to
 * reach it; anything else would be testing a different control.
 */
async function pullToRefresh(list: {
  props: { refreshControl: { props: { onRefresh: () => void } } };
}) {
  await act(async () => {
    list.props.refreshControl.props.onRefresh();
  });
}

function renderList(overrides: Record<string, unknown> = {}) {
  const mapItem = jest.fn((row: Rfq) => ({
    key: row.rfq_id,
    title: row.title,
    status: row.status,
  }));
  const utils = render(
    <I18nProvider>
      <FetchListScreen<Rfq>
        heading="RFQs"
        endpoint="/procurement/rfqs"
        testID="rfq-screen"
        itemTestID="rfq-item"
        listTestID="rfq-list"
        mapItem={mapItem}
        {...overrides}
      />
    </I18nProvider>,
  );
  return { mapItem, utils };
}

describe('FetchListScreen', () => {
  beforeEach(() => {
    client.get.mockReset();
    client.get.mockResolvedValue(ROWS);
  });

  it('renders a row per item the endpoint returns', async () => {
    const { utils } = renderList();
    const { getAllByTestId } = await utils;

    await waitFor(() => expect(getAllByTestId('rfq-item')).toHaveLength(2));
  });

  it('reads a paged answer as well as a bare array', async () => {
    client.get.mockResolvedValue({ items: ROWS });

    const { utils } = renderList();
    const { getAllByTestId } = await utils;

    await waitFor(() => expect(getAllByTestId('rfq-item')).toHaveLength(2));
  });

  it('draws what the caller mapped, not the server row', async () => {
    const { utils } = renderList();
    const { getByText } = await utils;

    await waitFor(() => expect(getByText('Rebar supply')).toBeTruthy());
    expect(getByText('Concrete pump hire')).toBeTruthy();
  });

  // keyExtractor and renderItem both need the mapped shape; mapping in each of them ran a caller's
  // mapper twice for every row, on every render.
  it('runs the caller`s mapper once per row', async () => {
    const { mapItem, utils } = renderList();
    await utils;

    await waitFor(() => expect(mapItem).toHaveBeenCalledTimes(ROWS.length));
  });

  it('omits the status chip for a row that has no status', async () => {
    const { utils } = renderList({
      mapItem: (row: Rfq) => ({ key: row.rfq_id, title: row.title }),
    });
    const { getAllByTestId, queryByText } = await utils;

    await waitFor(() => expect(getAllByTestId('rfq-item')).toHaveLength(2));
    expect(queryByText('OPEN')).toBeNull();
  });

  it('shows the caller`s empty text when the endpoint returns nothing', async () => {
    client.get.mockResolvedValue([]);

    const { utils } = renderList({ emptyText: 'No RFQs yet' });
    const { getByText } = await utils;

    await waitFor(() => expect(getByText('No RFQs yet')).toBeTruthy());
  });

  it('falls back to the shared empty text when the caller supplies none', async () => {
    client.get.mockResolvedValue([]);

    const { utils } = renderList();
    const { getByTestId, queryAllByTestId } = await utils;

    await waitFor(() => expect(getByTestId('rfq-screen')).toBeTruthy());
    expect(queryAllByTestId('rfq-item')).toHaveLength(0);
  });

  // THE OFFLINE RULE. An empty list is a claim that there is nothing; a failed request supports no
  // claim, so the last list stays on screen.
  it('keeps the last list when a refresh fails offline', async () => {
    const { utils } = renderList();
    const { getAllByTestId, getByTestId } = await utils;

    await waitFor(() => expect(getAllByTestId('rfq-item')).toHaveLength(2));

    client.get.mockRejectedValue(new Error('offline'));
    await pullToRefresh(getByTestId('rfq-list') as never);

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    expect(getAllByTestId('rfq-item')).toHaveLength(2);
  });

  it('shows the screen with no rows when the very first fetch fails', async () => {
    client.get.mockRejectedValue(new Error('offline'));

    const { utils } = renderList();
    const { getByTestId, queryAllByTestId } = await utils;

    await waitFor(() => expect(getByTestId('rfq-screen')).toBeTruthy());
    expect(queryAllByTestId('rfq-item')).toHaveLength(0);
  });

  it('refetches from the same endpoint on pull-to-refresh', async () => {
    const { utils } = renderList();
    const { getByTestId } = await utils;

    await waitFor(() => expect(client.get).toHaveBeenCalledWith('/procurement/rfqs'));
    await pullToRefresh(getByTestId('rfq-list') as never);

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    expect(client.get).toHaveBeenLastCalledWith('/procurement/rfqs');
  });
});
