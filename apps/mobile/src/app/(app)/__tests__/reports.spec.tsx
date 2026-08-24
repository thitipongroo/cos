// Behaviour of the SITE_ENGINEER reports list, pinned before the row-memoization refactor.
//
// This is the most stateful of the seven list screens: the query is scoped to the active project,
// paged, searchable, and each card expands to a material-consumption form keyed on the row that was
// tapped. Those are the couplings a row memoized on the wrong props severs — most visibly the
// expansion, which would open the form under a different report than the one pressed.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import { useProjectStore } from '../../../store/projectStore';
import { useThemeStore } from '../../../store/themeStore';
import { paletteFor } from '../../../theme/palette';
import ReportsScreen from '../reports';

jest.mock('../../../api/client', () => ({ get: jest.fn(), post: jest.fn(), mutate: jest.fn() }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as {
  get: jest.Mock;
  post: jest.Mock;
  mutate: jest.Mock;
};

const PROJECT_ID = 'proj-1';

function report(over: Partial<Record<string, unknown>> = {}) {
  return {
    report_id: 'rep-1',
    report_date: '2026-08-18',
    status: 'SUBMITTED',
    summary: null,
    blockers: 'Concrete pour delayed',
    blocker_category: 'MATERIAL',
    client_submitted_at: '2026-08-18T09:15:00Z',
    server_received_at: '2026-08-18T09:20:00Z',
    ...over,
  };
}

function renderScreen() {
  return render(
    <I18nProvider>
      <ReportsScreen />
    </I18nProvider>,
  );
}

describe('ReportsScreen', () => {
  beforeEach(() => {
    client.get.mockReset();
    client.post.mockReset();
    client.mutate.mockReset();
    mockPush.mockReset();
    useProjectStore.setState({
      active: { projectId: PROJECT_ID, projectName: 'Riverside Tower' },
    } as never);
  });

  it('renders one card per report returned by the API', async () => {
    client.get.mockResolvedValue({
      items: [report(), report({ report_id: 'rep-2', blockers: 'Crane down' })],
      total: 2,
    });

    const { getAllByTestId, getByText } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('report-item')).toHaveLength(2));
    expect(getByText('Concrete pour delayed')).toBeTruthy();
    expect(getByText('Crane down')).toBeTruthy();
  });

  it('scopes the query to the project named by the context bar', async () => {
    client.get.mockResolvedValue({ items: [report()], total: 1 });

    await renderScreen();

    await waitFor(() =>
      expect(client.get).toHaveBeenCalledWith(expect.stringContaining(`project_id=${PROJECT_ID}`)),
    );
  });

  it('appends the next page rather than replacing the list', async () => {
    client.get.mockImplementation((path: string) =>
      path.includes('page=2')
        ? Promise.resolve({
            items: [report({ report_id: 'rep-2', blockers: 'Crane down' })],
            total: 2,
          })
        : Promise.resolve({ items: [report()], total: 2 }),
    );

    const { getAllByTestId, getByTestId, getByText } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('report-item')).toHaveLength(1));

    await fireEvent.press(getByTestId('reports-load-more'));

    await waitFor(() => expect(getAllByTestId('report-item')).toHaveLength(2));
    // The first page is still there — this is an append, not a replace.
    expect(getByText('Concrete pour delayed')).toBeTruthy();
    expect(getByText('Crane down')).toBeTruthy();
  });

  it('opens the material form on the card that was tapped, and closes it on a second tap', async () => {
    client.get.mockResolvedValue({
      items: [report(), report({ report_id: 'rep-2', blockers: 'Crane down' })],
      total: 2,
    });

    const { getAllByTestId, getByText, queryAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('report-item')).toHaveLength(2));
    expect(queryAllByTestId('material-name-input')).toHaveLength(0);

    await fireEvent.press(getByText('Concrete pour delayed'));
    await waitFor(() => expect(queryAllByTestId('material-name-input')).toHaveLength(1));

    await fireEvent.press(getByText('Concrete pour delayed'));
    await waitFor(() => expect(queryAllByTestId('material-name-input')).toHaveLength(0));
  });

  it('shows the server total, not the number of rows on screen', async () => {
    client.get.mockResolvedValue({ items: [report()], total: 42 });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('reports-total')).toBeTruthy());
    // The label is the server's own `total`, not the one row on screen.
    expect(String(getByTestId('reports-total').props.children)).toContain('42');
  });

  it('keeps the screen usable when the list request fails offline', async () => {
    client.get.mockRejectedValue(new Error('offline'));

    const { getByTestId, queryAllByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('reports-screen')).toBeTruthy());
    expect(queryAllByTestId('report-item')).toHaveLength(0);
  });

  // ── THE CARD'S TWO COLOURS ───────────────────────────────────────────────────────────────────
  //
  // The chip says WHAT STATE the report is in; the left accent answers a different question — DOES
  // THIS NEED ME — and the two disagree on purpose. A submitted report with a named blocker is
  // green on the chip and red on the strip, and collapsing them into one colour would lose whichever
  // question the survivor did not answer.

  it('marks a draft as unfinished work on both the chip and the strip', async () => {
    client.get.mockResolvedValue({ items: [report({ status: 'DRAFT' })], total: 1 });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('report-item')).toBeTruthy());
    expect(accentOf(getByTestId('report-item'))).toBe(warning());
  });

  // A NAMED cause someone can act on — WEATHER, MATERIAL or POWER.
  it.each(['WEATHER', 'MATERIAL', 'POWER'])('escalates a %s blocker', async (category) => {
    client.get.mockResolvedValue({
      items: [report({ status: 'SUBMITTED', blocker_category: category })],
      total: 1,
    });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('report-item')).toBeTruthy());
    expect(accentOf(getByTestId('report-item'))).toBe(danger());
  });

  // OTHER names no cause, so there is nothing to escalate to — it takes the same path as no blocker
  // at all, which is what keeps the three rules a partition rather than three overlapping tests.
  it('does not escalate a blocker that names no cause', async () => {
    client.get.mockResolvedValue({
      items: [report({ status: 'SUBMITTED', blocker_category: 'OTHER' })],
      total: 1,
    });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('report-item')).toBeTruthy());
    expect(accentOf(getByTestId('report-item'))).toBe(success());
  });

  it('leaves a report with nothing blocking it alone', async () => {
    client.get.mockResolvedValue({
      items: [report({ status: 'ACKNOWLEDGED', blocker_category: null })],
      total: 1,
    });

    const { getByTestId, queryByText } = await renderScreen();

    await waitFor(() => expect(getByTestId('report-item')).toBeTruthy());
    expect(accentOf(getByTestId('report-item'))).toBe(success());
    // No blocker recorded → no blocker row at all, rather than a row saying nothing.
    expect(queryByText('report-problem')).toBeNull();
  });

  // ── THE HEADLINE ─────────────────────────────────────────────────────────────────────────────
  //
  // `blockers` is what the report says went wrong and is the slot the product owner chose
  // (2026-08-12). The fallbacks matter because a card with no headline is a card a reader cannot
  // tell from the one above it.

  it('leads with what went wrong', async () => {
    client.get.mockResolvedValue({
      items: [report({ blockers: 'Crane down since 06:00', summary: 'Routine day' })],
      total: 1,
    });

    const { getByText } = await renderScreen();

    await waitFor(() => expect(getByText('Crane down since 06:00')).toBeTruthy());
  });

  it('falls back to the report summary when nothing was blocking', async () => {
    client.get.mockResolvedValue({
      items: [report({ blockers: null, summary: 'Slab poured on level 4' })],
      total: 1,
    });

    const { getByText } = await renderScreen();

    await waitFor(() => expect(getByText('Slab poured on level 4')).toBeTruthy());
  });

  // Only a report with NEITHER takes the generic name — and it still takes one, because a blank
  // line in a list of cards reads as a broken row rather than an empty field.
  it('names a report that says neither', async () => {
    client.get.mockResolvedValue({
      items: [report({ blockers: null, summary: null })],
      total: 1,
    });

    const { getByText } = await renderScreen();

    await waitFor(() => expect(getByText('Daily site report')).toBeTruthy());
  });

  // ── THE STAMP ────────────────────────────────────────────────────────────────────────────────
  //
  // The DATE is the report's own; the TIME is when it was submitted — the DEVICE's stamp where the
  // report was queued offline, else when the server received it. The device's own is preferred
  // because that is when the engineer was standing on the site, which is the time they remember;
  // the server's is when the phone next found signal, which can be the following morning.

  it('prefers the time the device submitted it', async () => {
    client.get.mockResolvedValue({
      items: [
        report({
          client_submitted_at: '2026-08-18T09:15:00Z',
          server_received_at: '2026-08-19T06:00:00Z',
        }),
      ],
      total: 1,
    });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('report-item')).toBeTruthy());
    expect(stampOf(getByTestId('report-item'))).toContain('•');
  });

  // A row carrying neither shows the date alone rather than a date and an empty separator.
  it('shows the date alone when no submission time was recorded', async () => {
    client.get.mockResolvedValue({
      items: [report({ client_submitted_at: null, server_received_at: null })],
      total: 1,
    });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('report-item')).toBeTruthy());
    expect(stampOf(getByTestId('report-item'))).not.toContain('•');
  });

  // ── SEARCH AND PAGING ────────────────────────────────────────────────────────────────────────

  // Searched on SUBMIT, not per keystroke: every character would otherwise be an OpenSearch round
  // trip from a phone on site data.
  it('searches on submit rather than on every keystroke', async () => {
    client.get.mockResolvedValue({ items: [report()], total: 1 });

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(1));

    await fireEvent.changeText(getByTestId('reports-search'), 'crane');

    expect(client.get).toHaveBeenCalledTimes(1);

    await fireEvent(getByTestId('reports-search'), 'submitEditing');

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    expect(String(client.get.mock.calls[1][0])).toContain('q=crane');
  });

  // The clear control re-runs the query WITHOUT the term, rather than only emptying the box: a box
  // that reads empty over results that are still filtered is a list lying about what it contains.
  it('re-runs the query when the search is cleared', async () => {
    client.get.mockResolvedValue({ items: [report()], total: 1 });

    const { getByTestId } = await renderScreen();
    await fireEvent.changeText(getByTestId('reports-search'), 'crane');
    await fireEvent(getByTestId('reports-search'), 'submitEditing');
    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));

    await fireEvent.press(getByTestId('reports-search-clear'));

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(3));
    expect(String(client.get.mock.calls[2][0])).not.toContain('q=');
  });

  it('offers no clear control while the box is empty', async () => {
    client.get.mockResolvedValue({ items: [], total: 0 });

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('reports-screen')).toBeTruthy());
    expect(queryByTestId('reports-search-clear')).toBeNull();
  });

  // The response carries its own `total`, so "is there more" is READ, never inferred from a full
  // page — the guess cost one empty request whenever the count divided exactly by the page size.
  it('offers more history only while the server says rows remain', async () => {
    client.get.mockResolvedValue({ items: [report()], total: 42 });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('reports-load-more')).toBeTruthy());
  });

  it('offers none once the list holds everything', async () => {
    client.get.mockResolvedValue({ items: [report()], total: 1 });

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('report-item')).toBeTruthy());
    expect(queryByTestId('reports-load-more')).toBeNull();
  });

  // NEVER UNDER A SEARCH. The `q` path is unpaged by contract — it returns the OpenSearch hits
  // (capped at 50) and reports `total` as that count — so a "load more" here would re-request a
  // page 2 that does not exist and append the same rows again.
  it('offers no more history while a search is active', async () => {
    client.get.mockResolvedValue({ items: [report()], total: 42 });

    const { getByTestId, queryByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('reports-load-more')).toBeTruthy());

    await fireEvent.changeText(getByTestId('reports-search'), 'crane');

    expect(queryByTestId('reports-load-more')).toBeNull();
  });

  // ── THE CONTROLS THE DRAWING ASKS FOR ────────────────────────────────────────────────────────

  // Drawn but not wired (PO 2026-08-12), and DISABLED rather than merely inert: the state tells a
  // screen reader the same thing the dimming tells everyone else, so nobody taps a control that
  // will not answer.
  it('says the filter is not available rather than opening the wrong controls', async () => {
    client.get.mockResolvedValue({ items: [], total: 0 });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('reports-filter-button')).toBeTruthy());
    expect(getByTestId('reports-filter-button').props.accessibilityState.disabled).toBe(true);
  });

  // This plural list previously had no way to start the thing it lists: `/report` is the singular
  // form, a tab for no role since 2026-08-08.
  it('starts a new report from the list of them', async () => {
    client.get.mockResolvedValue({ items: [], total: 0 });

    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('reports-fab'));

    expect(mockPush).toHaveBeenCalledWith('/report');
  });

  // Every report endpoint is project-scoped, and the bar above is where that is answered — so with
  // no project chosen there is no site for the panel to summarise.
  it('summarises nothing until a site is chosen', async () => {
    useProjectStore.setState({ active: null } as never);
    client.get.mockResolvedValue({ items: [], total: 0 });

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('reports-screen')).toBeTruthy());
    expect(queryByTestId('site-insight')).toBeNull();
  });
});

// ── Reading a card ─────────────────────────────────────────────────────────────────────────────
//
// The tones are palette values rather than literals (§32.7 forbids a hex at a call site), so the
// assertions compare against the palette rather than against a colour written twice.

function palette() {
  // The ACTIVE mode, not an assumed one: the default is dark (PO 2026-08-04) and a test that pinned
  // the light palette would pass today and start failing the day the default moves.
  return paletteFor(useThemeStore.getState().mode);
}

function warning(): string {
  return palette().warning;
}
function danger(): string {
  return palette().danger;
}
function success(): string {
  return palette().success;
}

/** The card's LEFT ACCENT — "does this need me", not the status. */
function accentOf(card: { props: Record<string, unknown> }): string {
  const style = [card.props['style']].flat(2) as Array<Record<string, unknown> | undefined>;
  const strip = style.find((s) => s && 'borderLeftColor' in s);
  return String(strip?.['borderLeftColor']);
}

/** Every string in a card, in reading order. */
function texts(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (!node || typeof node !== 'object') return [];
  const n = node as { props?: { children?: unknown } };
  return [n.props?.children].flat(3).flatMap((c) => texts(c));
}

/** The "Oct 24 • 14:30" line. */
function stampOf(card: unknown): string {
  return texts(card).slice(0, 3).join(' ');
}
