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

  // ── THE AVATAR FALLBACK (PO 2026-08-20) ──────────────────────────────────────────────────────
  //
  // ONE RULE, EVERY AVATAR IN THE APP: the photo, else the initials, else a PERSON GLYPH — never a
  // literal "?", which is what several of these sites drew before the decision. `workforce.workers`
  // has no photo column at all, so on this screen the ladder starts at the initials and the glyph is
  // the only other outcome there is.
  //
  // The shape is never left EMPTY, which is the point: on the dark palette `elevated` sits so close
  // to `surface` that an unbordered empty circle vanished, and the initials beside it read as loose
  // letters next to the name (PO 2026-08-09).

  it('shows a crew member initials', async () => {
    client.get.mockResolvedValue({ items: [ALICE] });

    const { getByText } = await renderScreen();

    await waitFor(() => expect(getByText('AS')).toBeTruthy());
  });

  // A name that yields no initials is a real case here: `full_name` is free text typed by whoever
  // enrolled the worker, and an empty or whitespace-only value reaches this screen unchanged.
  //
  // A PUNCTUATION-ONLY NAME IS NOT ONE OF THEM. `initialsOf('—')` returns '—' — it takes the first
  // code point of the first word and does not ask what kind of character it is, which is what keeps
  // it correct for Thai. So that row draws a dash in the circle rather than the glyph. Recorded
  // because the obvious guess is the other way, and a test written on the guess fails.
  it.each([[''], ['   ']])(
    'falls back to a person glyph when the name %p yields no initials',
    async (fullName) => {
      client.get.mockResolvedValue({ items: [{ ...ALICE, full_name: fullName }] });

      const { getByText } = await renderScreen();

      await waitFor(() => expect(getByText('person')).toBeTruthy());
    },
  );

  // Never a question mark — the glyph is a person, which reads as "we do not have a face" rather
  // than as "something went wrong with this record".
  it('never draws a question mark for a nameless worker', async () => {
    client.get.mockResolvedValue({ items: [{ ...ALICE, full_name: '' }] });

    const { getByText, queryByText } = await renderScreen();

    await waitFor(() => expect(getByText('person')).toBeTruthy());
    expect(queryByText('?')).toBeNull();
  });
});
