// Behaviour of <OptimisticList /> — the §32.7 offline-first list wrapper.
//
// It has NO consumers today (grep across src finds none outside its own file), which is why it had
// no test either: nothing rendered it, so nothing exercised it. It is a specified component, so the
// answer is a test rather than a deletion — and the three states it exists for (pending dims the
// row, failed offers Retry, retry reports the item it belongs to) are worth holding in place before
// the first screen adopts it.

import { render, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { OptimisticList } from '../OptimisticList';

interface Row {
  id: string;
  label: string;
  state: 'synced' | 'pending' | 'failed';
}

const ROWS: Row[] = [
  { id: 'a', label: 'Synced row', state: 'synced' },
  { id: 'b', label: 'Pending row', state: 'pending' },
  { id: 'c', label: 'Failed row', state: 'failed' },
];

function renderList(overrides: Partial<Record<string, unknown>> = {}) {
  const onRetry = jest.fn();
  const utils = render(
    <OptimisticList<Row>
      testID="list"
      data={ROWS}
      keyExtractor={(row) => row.id}
      renderItem={(row) => <Text testID={`row-${row.id}`}>{row.label}</Text>}
      isPending={(row) => row.state === 'pending'}
      isFailed={(row) => row.state === 'failed'}
      onRetry={onRetry}
      retryLabel="Retry"
      {...overrides}
    />,
  );
  return { onRetry, utils };
}

describe('OptimisticList', () => {
  it("renders every item through the caller's renderItem", async () => {
    const { utils } = renderList();
    const { getByTestId } = await utils;

    expect(getByTestId('row-a')).toBeTruthy();
    expect(getByTestId('row-b')).toBeTruthy();
    expect(getByTestId('row-c')).toBeTruthy();
  });

  it('offers Retry only on the item whose sync failed', async () => {
    const { utils } = renderList();
    const { getAllByText } = await utils;

    expect(getAllByText('Retry')).toHaveLength(1);
  });

  it('reports the item that Retry was pressed on', async () => {
    const { onRetry, utils } = renderList();
    const { getByText } = await utils;

    await fireEvent.press(getByText('Retry'));

    expect(onRetry).toHaveBeenCalledWith(ROWS[2]);
  });

  it('offers no Retry when the caller supplies no handler', async () => {
    const { utils } = renderList({ onRetry: undefined });
    const { queryByText } = await utils;

    expect(queryByText('Retry')).toBeNull();
  });

  it('shows the empty text when there is nothing to list', async () => {
    const utils = render(
      <OptimisticList<Row>
        data={[]}
        keyExtractor={(row) => row.id}
        renderItem={(row) => <Text>{row.label}</Text>}
        emptyText="Nothing yet"
      />,
    );
    const { getByText } = await utils;

    expect(getByText('Nothing yet')).toBeTruthy();
  });
});
