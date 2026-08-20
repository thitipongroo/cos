// Behaviour of the conflict badge.
//
// A badge that reads zero is worse than no badge: it puts a permanent red dot in the chrome that
// means nothing, and a worker stops seeing it. So at zero this renders NOTHING at all — not a
// hidden view, not a zero.
//
// The cap exists because the count comes from the local conflict table, which after a long spell
// offline can hold more digits than the badge is wide. "99+" is a number that still fits and still
// says "a lot"; the raw count would either overflow the circle or shrink the type below legibility
// in gloves and sunlight.

import { render, fireEvent } from '@testing-library/react-native';
import { I18nProvider } from '../../i18n';
import { ConflictBadge } from '../ConflictBadge';

let mockConflicts: unknown[] = [];
jest.mock('../../hooks/useConflicts', () => ({ useConflicts: () => mockConflicts }));

function conflicts(n: number): unknown[] {
  return Array.from({ length: n }, (_, i) => ({ conflict_id: `c-${i}` }));
}

function renderBadge(props: Record<string, unknown> = {}) {
  return render(
    <I18nProvider>
      <ConflictBadge {...props} />
    </I18nProvider>,
  );
}

describe('ConflictBadge', () => {
  beforeEach(() => {
    mockConflicts = [];
  });

  // A permanent red dot that means nothing is a dot people stop seeing.
  it('renders nothing at all when nothing is in conflict', async () => {
    const { toJSON } = await renderBadge();

    expect(toJSON()).toBeNull();
  });

  it('shows the count when something is', async () => {
    mockConflicts = conflicts(3);

    const { getByText } = await renderBadge();

    expect(getByText('3')).toBeTruthy();
  });

  it('shows a single conflict as one, not as a bare dot', async () => {
    mockConflicts = conflicts(1);

    const { getByText } = await renderBadge();

    expect(getByText('1')).toBeTruthy();
  });

  // The boundary, both sides of it.
  it('shows the last count that fits', async () => {
    mockConflicts = conflicts(99);

    const { getByText } = await renderBadge();

    expect(getByText('99')).toBeTruthy();
  });

  it('caps the count where the digits stop fitting', async () => {
    mockConflicts = conflicts(100);

    const { getByText, queryByText } = await renderBadge();

    expect(getByText('99+')).toBeTruthy();
    expect(queryByText('100')).toBeNull();
  });

  it('still says 99+ far past the cap', async () => {
    mockConflicts = conflicts(250);

    const { getByText } = await renderBadge();

    expect(getByText('99+')).toBeTruthy();
  });

  // The count is in the spoken label too: the digit alone is a colour and a shape to a screen
  // reader, and the thing it counts has to be named.
  it('says what the number counts', async () => {
    mockConflicts = conflicts(3);

    const { getByLabelText } = await renderBadge();

    expect(getByLabelText(/3/)).toBeTruthy();
  });

  it('opens the review screen when it is given a handler', async () => {
    mockConflicts = conflicts(2);
    const onPress = jest.fn();

    const { getByText } = await renderBadge({ onPress });

    await fireEvent.press(getByText('2'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // It is also drawn where nothing navigates — a press there must simply do nothing rather than
  // throw on an undefined handler.
  it('is inert, not broken, without one', async () => {
    mockConflicts = conflicts(2);

    const { getByText } = await renderBadge();

    await fireEvent.press(getByText('2'));

    expect(getByText('2')).toBeTruthy();
  });
});
