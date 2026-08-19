// Behaviour of the team directory, pinned before it is moved off ScrollView onto a FlatList.
//
// The crew of a large site is unbounded and every card is rendered today, so this screen is one of
// the two the virtualization change targets. What must survive that change: the search filter, the
// on-site count, the per-card call action, and the three empty/error states — none of which are
// FlatList's to get right for free.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { I18nProvider } from '../../../i18n';
import { useProjectStore } from '../../../store/projectStore';
import DirectoryScreen from '../directory';

jest.mock('../../../api/client', () => ({ get: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as { get: jest.Mock };

const PROJECT_ID = 'proj-1';

const ALICE = {
  worker_id: 'w-1',
  full_name: 'Alice Somchai',
  trade_type: 'Carpenter',
  role_on_project: 'Foreman',
  contact_phone: '+66811111111',
  on_site: true,
};

const BOB = {
  worker_id: 'w-2',
  full_name: 'Bob Wattana',
  trade_type: 'Welder',
  role_on_project: null,
  contact_phone: null,
  on_site: false,
};

function renderScreen() {
  return render(
    <I18nProvider>
      <DirectoryScreen />
    </I18nProvider>,
  );
}

describe('DirectoryScreen', () => {
  beforeEach(() => {
    client.get.mockReset();
    useProjectStore.setState({
      active: { projectId: PROJECT_ID, projectName: 'Riverside Tower' },
    } as never);
  });

  it('renders one card per member of the crew', async () => {
    client.get.mockResolvedValue([ALICE, BOB]);

    const { getByTestId, getByText } = await renderScreen();

    await waitFor(() => expect(getByTestId('directory-card-w-1')).toBeTruthy());
    expect(getByTestId('directory-card-w-2')).toBeTruthy();
    expect(getByText('Alice Somchai')).toBeTruthy();
    expect(getByText('Bob Wattana')).toBeTruthy();
  });

  it('fetches the directory of the project named by the context bar', async () => {
    client.get.mockResolvedValue([ALICE]);

    await renderScreen();

    await waitFor(() =>
      expect(client.get).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/workforce/directory`),
    );
  });

  it('narrows the list as the reader types', async () => {
    client.get.mockResolvedValue([ALICE, BOB]);

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('directory-card-w-2')).toBeTruthy());

    await fireEvent.changeText(getByTestId('directory-search'), 'Alice');

    await waitFor(() => expect(queryByTestId('directory-card-w-2')).toBeNull());
    expect(getByTestId('directory-card-w-1')).toBeTruthy();
  });

  it('counts who is on site now, out of the whole crew', async () => {
    client.get.mockResolvedValue([ALICE, BOB]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('directory-count')).toBeTruthy());
    const label = String(getByTestId('directory-count').props.children);
    expect(label).toContain('1');
    expect(label).toContain('2');
  });

  it('dials the worker whose call button was pressed', async () => {
    client.get.mockResolvedValue([ALICE, BOB]);
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('directory-card-w-1')).toBeTruthy());
    await fireEvent.press(getByTestId('directory-call-w-1'));

    expect(openURL).toHaveBeenCalledWith('tel:+66811111111');
    openURL.mockRestore();
  });

  it('shows the error state rather than a stale crew when the request fails', async () => {
    client.get.mockRejectedValue(new Error('offline'));

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('directory-error')).toBeTruthy());
    expect(queryByTestId('directory-card-w-1')).toBeNull();
  });

  it('asks for a project when none is chosen, and fetches nothing', async () => {
    useProjectStore.setState({ active: null } as never);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('directory-empty')).toBeTruthy());
    expect(client.get).not.toHaveBeenCalled();
  });
});
