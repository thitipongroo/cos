// Behaviour of the project picker — the product's one project-selection shape (PO 2026-08-12).
//
// Two rules here are the ones that have bitten before, and both are about not trapping the user.
//
// OFFERED ONCE, NOT HELD OPEN. A worker with no site chosen is shown the picker the first time the
// shell mounts, because every Site Worker screen is reachable directly — from a tab, a notification
// or a deep link — so the offer belongs in the shell rather than on Home. After that it is theirs
// to open: re-raising it on every render makes the close button do nothing, which is a no-way-out
// modal by another name.
//
// KEYED ON THE ACCESS TOKEN. The shell shows this the moment the role is known, which can be before
// the token has reached the store — the request then goes out unauthenticated and comes back 401,
// and the sheet, being the first thing shown, never loses focus and so had nothing to make it try
// again. It failed that way twice in a row on the capture rig before the cause was found.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../i18n';
import { useAuthStore } from '../../store/authStore';
import { useProjectStore } from '../../store/projectStore';
import { SelectProjectSheet } from '../SelectProjectSheet';

jest.mock('../../api/projects', () => ({
  ...jest.requireActual('../../api/projects'),
  getMyProjects: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../../api/projects') as { getMyProjects: jest.Mock };

function project(n: number, over: Partial<Record<string, unknown>> = {}) {
  return {
    project_id: `p-${n}`,
    project_name: `Riverside Tower ${n}`,
    project_code: `PRJ-${n}`,
    status: 'ACTIVE',
    ...over,
  };
}

function renderSheet() {
  return render(
    <I18nProvider>
      <SelectProjectSheet />
    </I18nProvider>,
  );
}

describe('SelectProjectSheet', () => {
  let openPicker: jest.Mock;
  let closePicker: jest.Mock;
  let select: jest.Mock;

  beforeEach(() => {
    openPicker = jest.fn();
    closePicker = jest.fn();
    select = jest.fn();
    api.getMyProjects.mockReset();
    api.getMyProjects.mockResolvedValue([project(1), project(2)]);
    useAuthStore.setState({ accessToken: 'tok-1' } as never);
    useProjectStore.setState({
      active: { projectId: 'p-1', projectName: 'Riverside Tower 1' },
      pickerOpen: true,
      openPicker,
      closePicker,
      select,
    } as never);
  });

  it('lists the projects the worker is a member of', async () => {
    const { getByTestId } = await renderSheet();

    await waitFor(() => expect(getByTestId('select-project-p-1')).toBeTruthy());
    expect(getByTestId('select-project-p-2')).toBeTruthy();
  });

  it('selects the project that was tapped', async () => {
    const { getByTestId } = await renderSheet();

    await waitFor(() => expect(getByTestId('select-project-p-2')).toBeTruthy());
    await fireEvent.press(getByTestId('select-project-p-2'));

    await waitFor(() => expect(select).toHaveBeenCalledTimes(1));
    expect(select.mock.calls[0][0]).toMatchObject({ projectId: 'p-2' });
  });

  // ALWAYS CLOSEABLE — the PO decision that made this a card on a backdrop rather than a route.
  it('closes on the close control', async () => {
    const { getByTestId } = await renderSheet();

    await waitFor(() => expect(getByTestId('select-project-close')).toBeTruthy());
    await fireEvent.press(getByTestId('select-project-close'));

    expect(closePicker).toHaveBeenCalledTimes(1);
  });

  it('closes on the backdrop', async () => {
    const { getByTestId } = await renderSheet();

    await waitFor(() => expect(getByTestId('select-project-backdrop')).toBeTruthy());
    await fireEvent.press(getByTestId('select-project-backdrop'));

    expect(closePicker).toHaveBeenCalledTimes(1);
  });

  it('does not close on a tap inside the card', async () => {
    const { getByTestId } = await renderSheet();

    await waitFor(() => expect(getByTestId('select-project-screen')).toBeTruthy());
    await fireEvent.press(getByTestId('select-project-screen'));

    expect(closePicker).not.toHaveBeenCalled();
  });

  // OFFERED ONCE. The offer is made because no site is chosen, not because the sheet rendered.
  it('offers itself when no site has been chosen', async () => {
    useProjectStore.setState({
      active: null,
      pickerOpen: false,
      openPicker,
      closePicker,
      select,
    } as never);

    await renderSheet();

    await waitFor(() => expect(openPicker).toHaveBeenCalledTimes(1));
  });

  it('does not offer itself when a site is already chosen', async () => {
    useProjectStore.setState({
      active: { projectId: 'p-1', projectName: 'Riverside Tower 1' },
      pickerOpen: false,
      openPicker,
      closePicker,
      select,
    } as never);

    await renderSheet();

    expect(openPicker).not.toHaveBeenCalled();
  });

  it('narrows the list by name', async () => {
    const { getByTestId, queryByTestId } = await renderSheet();

    await waitFor(() => expect(getByTestId('select-project-p-2')).toBeTruthy());
    await fireEvent.changeText(getByTestId('select-project-search'), 'Tower 2');

    await waitFor(() => expect(queryByTestId('select-project-p-1')).toBeNull());
    expect(getByTestId('select-project-p-2')).toBeTruthy();
  });

  it('says so when the search matches nothing', async () => {
    const { getByTestId } = await renderSheet();

    await waitFor(() => expect(getByTestId('select-project-p-1')).toBeTruthy());
    await fireEvent.changeText(getByTestId('select-project-search'), 'no such site');

    await waitFor(() => expect(getByTestId('select-project-no-match')).toBeTruthy());
  });

  it('says so when the worker is on no projects at all', async () => {
    api.getMyProjects.mockResolvedValue([]);

    const { getByTestId } = await renderSheet();

    await waitFor(() => expect(getByTestId('select-project-empty')).toBeTruthy());
  });

  // A failure is not an empty membership, and the sheet cannot be escaped by ignoring it — so it
  // offers a retry rather than an empty list.
  it('offers a retry when the request fails', async () => {
    api.getMyProjects.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderSheet();

    await waitFor(() => expect(getByTestId('select-project-failed')).toBeTruthy());
    expect(getByTestId('select-project-retry')).toBeTruthy();
  });

  it('fetches again when the retry is taken', async () => {
    api.getMyProjects.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderSheet();
    await waitFor(() => expect(getByTestId('select-project-retry')).toBeTruthy());

    api.getMyProjects.mockResolvedValue([project(1)]);
    await fireEvent.press(getByTestId('select-project-retry'));

    await waitFor(() => expect(getByTestId('select-project-p-1')).toBeTruthy());
  });
});
