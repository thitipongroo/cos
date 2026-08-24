// Behaviour of the safety checklist, pinned before its item row is memoized.
//
// This is the one screen in the sweep where the rows are a FORM rather than a feed: every item must
// be ticked before the worker can attest, and `checked` lives on the screen keyed by
// "checklistId:itemKey". A row memoized on the wrong props ticks the wrong box — on a safety
// verification that is a statement nobody made, which is why the tests below assert WHICH box moved
// and not merely that a count went up.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import { useProjectStore } from '../../../store/projectStore';
import SafetyChecklistScreen from '../safety-checklist';

jest.mock('../../../api/client', () => ({ get: jest.fn(), mutate: jest.fn() }));
jest.mock('../../../hooks/useCollection', () => ({ useCollection: jest.fn(() => []) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as { get: jest.Mock; mutate: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useCollection } = require('../../../hooks/useCollection') as { useCollection: jest.Mock };

const PROJECT_ID = 'proj-1';

/** The server shape: `items` already parsed. */
const REMOTE = [
  {
    checklist_id: 'cl-1',
    checklist_name: 'Foundation inspection',
    project_id: PROJECT_ID,
    version: 1,
    items: [
      { item_id: 'rebar', description: 'Rebar spacing verified', is_required: true },
      { item_id: 'formwork', description: 'Formwork braced', is_required: true },
    ],
  },
];

function renderScreen() {
  return render(
    <I18nProvider>
      <SafetyChecklistScreen />
    </I18nProvider>,
  );
}

describe('SafetyChecklistScreen', () => {
  beforeEach(() => {
    client.get.mockReset();
    client.mutate.mockReset();
    useCollection.mockReset();
    useCollection.mockReturnValue([]);
    client.get.mockResolvedValue(REMOTE);
    useProjectStore.setState({
      active: { projectId: PROJECT_ID, projectName: 'Riverside Tower' },
    } as never);
  });

  it('renders one row per checklist item', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('safety-item-cl-1:rebar')).toBeTruthy());
    expect(getByTestId('safety-item-cl-1:formwork')).toBeTruthy();
  });

  it('ticks the box that was pressed, and only that box', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('safety-item-cl-1:rebar')).toBeTruthy());
    await fireEvent.press(getByTestId('safety-item-cl-1:rebar'));

    await waitFor(() =>
      expect(getByTestId('safety-item-cl-1:rebar').props.accessibilityState.checked).toBe(true),
    );
    expect(getByTestId('safety-item-cl-1:formwork').props.accessibilityState.checked).toBe(false);
  });

  it('unticks on a second press', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('safety-item-cl-1:rebar')).toBeTruthy());
    await fireEvent.press(getByTestId('safety-item-cl-1:rebar'));
    await waitFor(() =>
      expect(getByTestId('safety-item-cl-1:rebar').props.accessibilityState.checked).toBe(true),
    );

    await fireEvent.press(getByTestId('safety-item-cl-1:rebar'));
    await waitFor(() =>
      expect(getByTestId('safety-item-cl-1:rebar').props.accessibilityState.checked).toBe(false),
    );
  });

  it('counts the ticked items against the total', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('safety-verification')).toBeTruthy());
    const before = String(getByTestId('safety-verification').props.children);
    expect(before).toContain('0');
    expect(before).toContain('2');

    await fireEvent.press(getByTestId('safety-item-cl-1:rebar'));

    await waitFor(() =>
      expect(String(getByTestId('safety-verification').props.children)).toContain('1'),
    );
  });

  it('renders the screen with no items when the request fails and nothing is cached', async () => {
    client.get.mockRejectedValue(new Error('offline'));

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('safety-checklist-screen')).toBeTruthy());
    expect(queryByTestId('safety-item-cl-1:rebar')).toBeNull();
  });
});
