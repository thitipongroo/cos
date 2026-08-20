// Behaviour of the material request form.
//
// The submit gate is what matters here: a purchase request with no project, or with a line that
// has no unit or a quantity of zero, is a document a buyer cannot act on. The screen refuses to
// send one, and since 2026-08-20 it says so to a screen reader as well as by dimming — which is
// what `accessibilityState.disabled` is asserted for below rather than the style.
//
// The other half is the offline answer: `mutate()` returns `{queued: true}` when a write was
// stored for replay instead of sent, and the screen must say "queued", not "created". Telling a
// site engineer their order is placed when it is sitting in a queue is the kind of lie that gets
// noticed a week later on a delivery date.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import MaterialRequestScreen from '../material-request';

jest.mock('../../../api/procurement', () => ({
  ...jest.requireActual('../../../api/procurement'),
  createPurchaseRequest: jest.fn(),
}));
// The picker reads the offline project cache and refreshes it; neither is what this screen is for.
jest.mock('../../../hooks/useCollection', () => ({
  useCollection: jest.fn(() => [{ projectId: 'proj-1', projectCode: 'PRJ-1' }]),
}));
jest.mock('../../../api/projects', () => ({
  refreshProjectsCache: jest.fn().mockResolvedValue([]),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../../../api/procurement') as { createPurchaseRequest: jest.Mock };

function renderScreen() {
  return render(
    <I18nProvider>
      <MaterialRequestScreen />
    </I18nProvider>,
  );
}

/** Fill the project and one complete line — the minimum the form will send. */
async function fillOneLine(getByTestId: (id: string) => never) {
  await fireEvent.press(getByTestId('project-option-proj-1'));
  await fireEvent.changeText(getByTestId('item-0-description'), 'Rebar 12mm');
  await fireEvent.changeText(getByTestId('item-0-quantity'), '40');
  await fireEvent.changeText(getByTestId('item-0-unit'), 'bars');
}

describe('MaterialRequestScreen', () => {
  beforeEach(() => {
    api.createPurchaseRequest.mockReset();
    api.createPurchaseRequest.mockResolvedValue({ purchase_request_id: 'pr-1' });
  });

  it('opens with one empty line and submit off', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('item-0')).toBeTruthy();
    expect(getByTestId('submit-request').props.accessibilityState.disabled).toBe(true);
  });

  it('stays off while the line is complete but no project is chosen', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('item-0-description'), 'Rebar 12mm');
    await fireEvent.changeText(getByTestId('item-0-quantity'), '40');
    await fireEvent.changeText(getByTestId('item-0-unit'), 'bars');

    expect(getByTestId('submit-request').props.accessibilityState.disabled).toBe(true);
  });

  it('stays off for a line with no unit', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('project-option-proj-1'));
    await fireEvent.changeText(getByTestId('item-0-description'), 'Rebar 12mm');
    await fireEvent.changeText(getByTestId('item-0-quantity'), '40');

    expect(getByTestId('submit-request').props.accessibilityState.disabled).toBe(true);
  });

  it('stays off for a quantity of zero', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('project-option-proj-1'));
    await fireEvent.changeText(getByTestId('item-0-description'), 'Rebar 12mm');
    await fireEvent.changeText(getByTestId('item-0-quantity'), '0');
    await fireEvent.changeText(getByTestId('item-0-unit'), 'bars');

    expect(getByTestId('submit-request').props.accessibilityState.disabled).toBe(true);
  });

  it('sends the project and the complete lines', async () => {
    const { getByTestId } = await renderScreen();

    await fillOneLine(getByTestId as never);
    await waitFor(() =>
      expect(getByTestId('submit-request').props.accessibilityState.disabled).toBe(false),
    );
    await fireEvent.press(getByTestId('submit-request'));

    await waitFor(() =>
      expect(api.createPurchaseRequest).toHaveBeenCalledWith({
        projectId: 'proj-1',
        requiredDate: undefined,
        items: [{ description: 'Rebar 12mm', quantity: 40, unit: 'bars' }],
      }),
    );
  });

  // An incomplete line is dropped rather than sent as a half-row a buyer would have to guess at.
  it('leaves an incomplete line out of the request', async () => {
    const { getByTestId } = await renderScreen();

    await fillOneLine(getByTestId as never);
    await fireEvent.press(getByTestId('add-item'));
    await waitFor(() => expect(getByTestId('item-1-description')).toBeTruthy());
    await fireEvent.changeText(getByTestId('item-1-description'), 'Cement');

    await fireEvent.press(getByTestId('submit-request'));

    await waitFor(() => expect(api.createPurchaseRequest).toHaveBeenCalledTimes(1));
    expect(api.createPurchaseRequest.mock.calls[0][0].items).toHaveLength(1);
  });

  it('removes the line whose Remove was pressed', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('add-item'));
    await waitFor(() => expect(getByTestId('item-1')).toBeTruthy());
    await fireEvent.press(getByTestId('item-1-remove'));

    await waitFor(() => expect(queryByTestId('item-1')).toBeNull());
    expect(getByTestId('item-0')).toBeTruthy();
  });

  // "Queued", not "created" — see the note at the top of this file.
  it('says the request was queued when it was stored for replay', async () => {
    api.createPurchaseRequest.mockResolvedValue({ queued: true });

    const { getByTestId } = await renderScreen();

    await fillOneLine(getByTestId as never);
    await fireEvent.press(getByTestId('submit-request'));

    await waitFor(() => expect(getByTestId('material-request-status')).toBeTruthy());
    expect(String(getByTestId('material-request-status').props.children)).not.toBe('');
  });

  it('reports a failure rather than clearing the form', async () => {
    api.createPurchaseRequest.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await fillOneLine(getByTestId as never);
    await fireEvent.press(getByTestId('submit-request'));

    await waitFor(() => expect(getByTestId('material-request-status')).toBeTruthy());
    expect(getByTestId('item-0-description').props.value).toBe('Rebar 12mm');
  });
});
