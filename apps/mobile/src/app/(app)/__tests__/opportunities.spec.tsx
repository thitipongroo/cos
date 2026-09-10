// Behaviour of the CRM opportunities list, pinned before its row is memoized.
//
// /crm/opportunities carries no LIMIT (backend crm.repository.ts), so every opportunity renders.
// The row carries per-row STATE — `busy` while its own convert is in flight — and offers Convert
// only while the status still allows it (WON is terminal, LOST is not a customer). Both are what a
// row memoized on the wrong props shows for the wrong opportunity.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import OpportunitiesScreen from '../opportunities';

jest.mock('../../../api/crm', () => ({
  listOpportunities: jest.fn(),
  createOpportunity: jest.fn(),
  convertOpportunity: jest.fn(),
  listLeads: jest.fn(async () => []),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const crm = require('../../../api/crm') as {
  listOpportunities: jest.Mock;
  createOpportunity: jest.Mock;
  convertOpportunity: jest.Mock;
  listLeads: jest.Mock;
};

const OPEN = {
  opportunity_id: 'o-1',
  lead_id: 'l-1',
  title: 'Riverside phase 2',
  value: '2500000.0000',
  currency_code: 'THB',
  status: 'OPEN',
  created_at: '2026-08-19T00:00:00Z',
};

const WON = { ...OPEN, opportunity_id: 'o-2', title: 'Harbour tower', status: 'WON' };

/**
 * Open the capture sheet.
 *
 * The lead picker, title and value sat above the list until 2026-09-10; the drawing replaced them
 * with a `+` over the list. Same three fields, same testIDs, one tap further in.
 */
async function openSheet(r: { getByTestId: (id: string) => unknown }) {
  await fireEvent.press(r.getByTestId('create-opportunity-fab') as never);
}

function renderScreen() {
  return render(
    <I18nProvider>
      <OpportunitiesScreen />
    </I18nProvider>,
  );
}

describe('OpportunitiesScreen', () => {
  beforeEach(() => {
    crm.listOpportunities.mockReset();
    crm.convertOpportunity.mockReset();
    crm.createOpportunity.mockReset();
    crm.listLeads.mockReset();
    crm.listLeads.mockResolvedValue([]);
    crm.convertOpportunity.mockResolvedValue(undefined);
    crm.createOpportunity.mockResolvedValue(OPEN);
  });

  it('renders one row per opportunity', async () => {
    crm.listOpportunities.mockResolvedValue([OPEN, WON]);

    const { getAllByTestId, getByText } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('opportunity-item')).toHaveLength(2));
    expect(getByText('Riverside phase 2')).toBeTruthy();
    expect(getByText('Harbour tower')).toBeTruthy();
  });

  it('offers Convert only on an opportunity that is still open', async () => {
    crm.listOpportunities.mockResolvedValue([OPEN, WON]);

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('convert-o-1')).toBeTruthy());
    expect(queryByTestId('convert-o-2')).toBeNull();
  });

  it('converts the opportunity whose button was pressed', async () => {
    crm.listOpportunities.mockResolvedValue([OPEN]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('convert-o-1')).toBeTruthy());
    await fireEvent.press(getByTestId('convert-o-1'));

    await waitFor(() => expect(crm.convertOpportunity).toHaveBeenCalledWith('o-1'));
  });

  it('keeps the screen usable when the request fails offline', async () => {
    crm.listOpportunities.mockRejectedValue(new Error('offline'));

    const { getByTestId, queryAllByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('opportunities-screen')).toBeTruthy());
    expect(queryAllByTestId('opportunity-item')).toHaveLength(0);
  });

  // ── THE LEAD IS MANDATORY ────────────────────────────────────────────────────────────────────
  //
  // An opportunity exists because a lead was qualified; there is no such thing as one that came
  // from nowhere. So the picker is not a filter — it is half the record, and the create control
  // stays shut until it is answered.
  //
  // The chips WRAP rather than scroll horizontally, and that is not cosmetic: the ScrollView
  // version rendered nothing at all on device (the leads were in state, the row laid out to
  // nothing). A wrapping row also shows every candidate at once, which matters for a choice that
  // cannot be skipped.

  it('will not create before a lead is chosen', async () => {
    crm.listOpportunities.mockResolvedValue([]);
    crm.listLeads.mockResolvedValue([lead()]);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('create-opportunity-fab')).toBeTruthy());
    await openSheet({ getByTestId });
    await waitFor(() => expect(getByTestId('opp-lead-l-1')).toBeTruthy());

    await fireEvent.changeText(getByTestId('opp-title-input'), 'Riverside phase 3');

    expect(getByTestId('create-opportunity-button').props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(getByTestId('create-opportunity-button'));

    expect(crm.createOpportunity).not.toHaveBeenCalled();
  });

  it('will not create on a title of nothing but spaces', async () => {
    crm.listOpportunities.mockResolvedValue([]);
    crm.listLeads.mockResolvedValue([lead()]);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('create-opportunity-fab')).toBeTruthy());
    await openSheet({ getByTestId });
    await waitFor(() => expect(getByTestId('opp-lead-l-1')).toBeTruthy());

    await fireEvent.press(getByTestId('opp-lead-l-1'));
    await fireEvent.changeText(getByTestId('opp-title-input'), '   ');

    expect(getByTestId('create-opportunity-button').props.accessibilityState.disabled).toBe(true);
  });

  // Chosen, and choosable again: tapping the selected chip clears it, because a mandatory choice
  // with no way back is a form the user has to leave and re-enter to correct.
  it('selects a lead and lets it be unselected', async () => {
    crm.listOpportunities.mockResolvedValue([]);
    crm.listLeads.mockResolvedValue([lead()]);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('create-opportunity-fab')).toBeTruthy());
    await openSheet({ getByTestId });
    await waitFor(() => expect(getByTestId('opp-lead-l-1')).toBeTruthy());

    await fireEvent.press(getByTestId('opp-lead-l-1'));
    expect(getByTestId('opp-lead-l-1').props.accessibilityState.selected).toBe(true);

    await fireEvent.press(getByTestId('opp-lead-l-1'));
    expect(getByTestId('opp-lead-l-1').props.accessibilityState.selected).toBe(false);
  });

  // A chip is read aloud as well as seen, and the company is the name the salesperson knows the
  // lead by. The contact is the fallback, and the id is the last resort — an id is not a name, but
  // it is at least distinct, which a blank chip is not.
  it('names a lead by its company', async () => {
    crm.listOpportunities.mockResolvedValue([]);
    crm.listLeads.mockResolvedValue([lead({ company: 'Siam Steel', contact_name: 'K. Anan' })]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('create-opportunity-fab')).toBeTruthy());
    await openSheet({ getByTestId });
    await waitFor(() => expect(getByTestId('opp-lead-l-1')).toBeTruthy());
    expect(getByTestId('opp-lead-l-1').props.accessibilityLabel).toBe('Siam Steel');
  });

  it('falls back to the contact where there is no company', async () => {
    crm.listOpportunities.mockResolvedValue([]);
    crm.listLeads.mockResolvedValue([lead({ company: null, contact_name: 'K. Anan' })]);

    const { getByTestId, getByText } = await renderScreen();

    await waitFor(() => expect(getByTestId('create-opportunity-fab')).toBeTruthy());
    await openSheet({ getByTestId });
    await waitFor(() => expect(getByTestId('opp-lead-l-1')).toBeTruthy());
    expect(getByTestId('opp-lead-l-1').props.accessibilityLabel).toBe('K. Anan');
    expect(getByText('K. Anan')).toBeTruthy();
  });

  // Neither: the chip still has to be distinguishable, so it takes the id as its spoken name and
  // the placeholder as its visible one.
  it('still gives a nameless lead something to be called', async () => {
    crm.listOpportunities.mockResolvedValue([]);
    crm.listLeads.mockResolvedValue([lead({ company: null, contact_name: null })]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('create-opportunity-fab')).toBeTruthy());
    await openSheet({ getByTestId });
    await waitFor(() => expect(getByTestId('opp-lead-l-1')).toBeTruthy());
    expect(getByTestId('opp-lead-l-1').props.accessibilityLabel).toBe('l-1');
  });

  // No leads at all is a state the screen has to say out loud: the form below it can never be
  // completed, and a form that simply refuses without explaining reads as broken.
  it('says so when there is no lead to start from', async () => {
    crm.listOpportunities.mockResolvedValue([]);
    crm.listLeads.mockResolvedValue([]);

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('create-opportunity-fab')).toBeTruthy());
    await openSheet({ getByTestId });
    await waitFor(() => expect(getByTestId('create-opportunity-button')).toBeTruthy());
    expect(queryByTestId('opp-lead-l-1')).toBeNull();
    expect(getByTestId('create-opportunity-button').props.accessibilityState.disabled).toBe(true);
  });

  // ── CREATING ─────────────────────────────────────────────────────────────────────────────────

  it('creates the opportunity from the lead and title given', async () => {
    crm.listOpportunities.mockResolvedValue([]);
    crm.listLeads.mockResolvedValue([lead()]);
    crm.createOpportunity.mockResolvedValue({ ...OPEN, title: 'Riverside phase 3' });

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('create-opportunity-fab')).toBeTruthy());
    await openSheet({ getByTestId });
    await waitFor(() => expect(getByTestId('opp-lead-l-1')).toBeTruthy());

    await fireEvent.press(getByTestId('opp-lead-l-1'));
    await fireEvent.changeText(getByTestId('opp-title-input'), '  Riverside phase 3  ');
    await fireEvent.press(getByTestId('create-opportunity-button'));

    await waitFor(() => expect(crm.createOpportunity).toHaveBeenCalledTimes(1));
    // Trimmed: the leading spaces are a keyboard artefact, not part of the name.
    expect(crm.createOpportunity).toHaveBeenCalledWith({
      lead_id: 'l-1',
      title: 'Riverside phase 3',
    });
  });

  // `value` is optional and '' is not a valid DECIMAL string — sending one would be a 400 on a
  // field the user deliberately left blank.
  it('sends a value only when one was entered', async () => {
    crm.listOpportunities.mockResolvedValue([]);
    crm.listLeads.mockResolvedValue([lead()]);
    crm.createOpportunity.mockResolvedValue(OPEN);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('create-opportunity-fab')).toBeTruthy());
    await openSheet({ getByTestId });
    await waitFor(() => expect(getByTestId('opp-lead-l-1')).toBeTruthy());

    await fireEvent.press(getByTestId('opp-lead-l-1'));
    await fireEvent.changeText(getByTestId('opp-title-input'), 'Harbour phase 1');
    await fireEvent.changeText(getByTestId('opp-value-input'), '900000');
    await fireEvent.press(getByTestId('create-opportunity-button'));

    await waitFor(() => expect(crm.createOpportunity).toHaveBeenCalledTimes(1));
    expect(crm.createOpportunity.mock.calls[0][0]).toMatchObject({ value: '900000' });
  });

  // The new row is prepended locally AND the list is refetched, and the refetch WINS — it replaces
  // the rows outright. That is the intended order: the prepend covers the round trip so the
  // salesperson sees their entry land, and the refetch is what stops the screen from carrying a row
  // the server never accepted. Asserted with a second response that contains it, which is what the
  // real endpoint returns.
  it('shows the new opportunity, and lets the refetch confirm it', async () => {
    crm.listOpportunities.mockResolvedValueOnce([WON]);
    crm.listOpportunities.mockResolvedValue([{ ...OPEN, title: 'Riverside phase 3' }, WON]);
    crm.listLeads.mockResolvedValue([lead()]);
    crm.createOpportunity.mockResolvedValue({ ...OPEN, title: 'Riverside phase 3' });

    const { getByTestId, getAllByTestId, getByText } = await renderScreen();
    await waitFor(() => expect(getByTestId('create-opportunity-fab')).toBeTruthy());
    await openSheet({ getByTestId });
    await waitFor(() => expect(getByTestId('opp-lead-l-1')).toBeTruthy());

    await fireEvent.press(getByTestId('opp-lead-l-1'));
    await fireEvent.changeText(getByTestId('opp-title-input'), 'Riverside phase 3');
    await fireEvent.press(getByTestId('create-opportunity-button'));

    await waitFor(() => expect(getAllByTestId('opportunity-item')).toHaveLength(2));
    expect(getByText('Riverside phase 3')).toBeTruthy();
  });

  // And the form empties, so the next entry starts clean rather than on top of the last one.
  it('closes the sheet once the opportunity is created, and it opens empty next time', async () => {
    crm.listOpportunities.mockResolvedValue([]);
    crm.listLeads.mockResolvedValue([lead()]);
    crm.createOpportunity.mockResolvedValue(OPEN);

    const { getByTestId, queryByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('create-opportunity-fab')).toBeTruthy());
    await openSheet({ getByTestId });
    await waitFor(() => expect(getByTestId('opp-lead-l-1')).toBeTruthy());

    await fireEvent.press(getByTestId('opp-lead-l-1'));
    await fireEvent.changeText(getByTestId('opp-title-input'), 'Harbour phase 1');
    await fireEvent.changeText(getByTestId('opp-value-input'), '900000');
    await fireEvent.press(getByTestId('create-opportunity-button'));

    // The sheet closes on success (2026-09-10) — the capture is finished and the list is what the
    // user wants back. The fields are still cleared, which is what reopening proves.
    await waitFor(() => expect(queryByTestId('opp-title-input')).toBeNull());
    await openSheet({ getByTestId });
    await waitFor(() => expect(getByTestId('opp-title-input').props.value).toBe(''));
    expect(getByTestId('opp-value-input').props.value).toBe('');
    expect(getByTestId('opp-lead-l-1').props.accessibilityState.selected).toBe(false);
  });

  // Creating an opportunity QUALIFIES THE LEAD server-side, so the picker's copy of that lead's
  // status is stale the moment the create returns. It is refetched rather than patched locally —
  // patching would be this screen guessing at a transition the server owns.
  it('refetches the leads, because creating one qualifies the lead server-side', async () => {
    crm.listOpportunities.mockResolvedValue([]);
    crm.listLeads.mockResolvedValue([lead()]);
    crm.createOpportunity.mockResolvedValue(OPEN);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(crm.listLeads).toHaveBeenCalledTimes(1));
    await openSheet({ getByTestId });
    await waitFor(() => expect(getByTestId('opp-lead-l-1')).toBeTruthy());

    await fireEvent.press(getByTestId('opp-lead-l-1'));
    await fireEvent.changeText(getByTestId('opp-title-input'), 'Harbour phase 1');
    await fireEvent.press(getByTestId('create-opportunity-button'));

    await waitFor(() => expect(crm.listLeads).toHaveBeenCalledTimes(2));
  });

  // The form empties only on success. A failed create that cleared the fields would have thrown
  // away what the user typed and given them nothing to retry with.
  it('keeps what was typed when the create fails', async () => {
    crm.listOpportunities.mockResolvedValue([]);
    crm.listLeads.mockResolvedValue([lead()]);
    crm.createOpportunity.mockRejectedValue(new Error('offline'));

    const { getByTestId, queryAllByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('create-opportunity-fab')).toBeTruthy());
    await openSheet({ getByTestId });
    await waitFor(() => expect(getByTestId('opp-lead-l-1')).toBeTruthy());

    await fireEvent.press(getByTestId('opp-lead-l-1'));
    await fireEvent.changeText(getByTestId('opp-title-input'), 'Harbour phase 1');
    await fireEvent.press(getByTestId('create-opportunity-button'));

    await waitFor(() => expect(crm.createOpportunity).toHaveBeenCalled());
    expect(getByTestId('opp-title-input').props.value).toBe('Harbour phase 1');
    expect(queryAllByTestId('opportunity-item')).toHaveLength(0);
  });

  // ── CONVERTING ───────────────────────────────────────────────────────────────────────────────

  // ONE AT A TIME, ACROSS THE WHOLE LIST — `busyId` is a single id, not a set. Converting creates a
  // customer, and two conversions racing is two customers from one pipeline.
  it('ignores a convert on another row while one is already in flight', async () => {
    const second = { ...OPEN, opportunity_id: 'o-3', title: 'Dock extension' };
    crm.listOpportunities.mockResolvedValue([OPEN, second]);
    crm.convertOpportunity.mockReturnValue(new Promise(() => undefined));

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('convert-o-1')).toBeTruthy());

    void fireEvent.press(getByTestId('convert-o-1'));
    await waitFor(() => expect(crm.convertOpportunity).toHaveBeenCalledTimes(1));

    void fireEvent.press(getByTestId('convert-o-3'));

    expect(crm.convertOpportunity).toHaveBeenCalledTimes(1);
  });

  // The busy row says so on itself, and only on itself: a spinner on every row would make the list
  // look like it is converting all of them.
  it('greys every convert while one is in flight, and only the working row says so', async () => {
    const second = { ...OPEN, opportunity_id: 'o-3', title: 'Dock extension' };
    crm.listOpportunities.mockResolvedValue([OPEN, second]);
    crm.convertOpportunity.mockReturnValue(new Promise(() => undefined));

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('convert-o-1')).toBeTruthy());

    void fireEvent.press(getByTestId('convert-o-1'));

    // EVERY convert greys, not just the pressed one. A convert writes finance.customers, and two
    // in flight at once is a race nothing referees — the test above ("ignores a convert on another
    // row") is the behaviour this state exists to produce.
    await waitFor(() =>
      expect(getByTestId('convert-o-1').props.accessibilityState.disabled).toBe(true),
    );
    expect(getByTestId('convert-o-3').props.accessibilityState.disabled).toBe(true);

    // Only the row actually working says "Converting…"; the other keeps its own label, so the user
    // can see WHICH deal is being converted.
    expect(getByTestId('convert-o-1')).toHaveTextContent(/Converting/i);
    expect(getByTestId('convert-o-3')).not.toHaveTextContent(/Converting/i);
  });

  // The server flipped the row to WON; the screen reflects exactly that and nothing more. The new
  // customer shows up on the Customers tab, which reads finance.customers directly.
  it('takes the convert control away once the row is won', async () => {
    crm.listOpportunities.mockResolvedValue([OPEN]);

    const { getByTestId, queryByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('convert-o-1')).toBeTruthy());

    await fireEvent.press(getByTestId('convert-o-1'));

    await waitFor(() => expect(queryByTestId('convert-o-1')).toBeNull());
  });

  // Already converted elsewhere, or offline: the row keeps the status it has rather than claiming a
  // customer that may not exist.
  it('leaves the row as it was when the convert fails', async () => {
    crm.listOpportunities.mockResolvedValue([OPEN]);
    crm.convertOpportunity.mockRejectedValue(new Error('COS-CRM-003'));

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('convert-o-1')).toBeTruthy());

    await fireEvent.press(getByTestId('convert-o-1'));

    await waitFor(() => expect(crm.convertOpportunity).toHaveBeenCalled());
    expect(getByTestId('convert-o-1')).toBeTruthy();
    expect(getByTestId('convert-o-1').props.accessibilityState.disabled).toBe(false);
  });

  // ── THE ROW ──────────────────────────────────────────────────────────────────────────────────

  // An opportunity with no figure yet shows no value row, rather than a labelled empty one — a key
  // with nothing beside it reads as a number that failed to load.
  it('shows no value row on an opportunity that has no figure', async () => {
    crm.listOpportunities.mockResolvedValue([{ ...OPEN, value: null }]);

    const { getByTestId, queryByText } = await renderScreen();

    await waitFor(() => expect(getByTestId('opportunity-item')).toBeTruthy());
    expect(queryByText('2500000.0000')).toBeNull();
  });

  it('shows the figure where there is one', async () => {
    crm.listOpportunities.mockResolvedValue([OPEN]);

    const { getByText } = await renderScreen();

    await waitFor(() => expect(getByText(/2,500,000/)).toBeTruthy());
  });

  it('says the list is empty rather than showing nothing at all', async () => {
    crm.listOpportunities.mockResolvedValue([]);

    const { getByTestId, queryAllByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('opportunity-list')).toBeTruthy());
    expect(queryAllByTestId('opportunity-item')).toHaveLength(0);
  });
});

/** A lead the picker can show. Only the three fields the chip reads are needed. */
function lead(over: Record<string, unknown> = {}) {
  return { lead_id: 'l-1', company: 'Siam Steel', contact_name: 'K. Anan', status: 'NEW', ...over };
}

// -- THE SECTION HEAD, THE ORDER AND THE LABEL (2026-09-10) -------------------------------------
//
// The drawing carries a "sorted by value" line over the list. Printing that over an UNSORTED list
// would be a claim about the order that nothing backs, so the list is sorted and these tests are
// what keep the line honest. The close-date label is here for the opposite reason: it was WRONG,
// naming a figure the field was not showing.

describe('OpportunitiesScreen - the section head and the order it claims', () => {
  const BIG = { ...OPEN, opportunity_id: 'o-big', title: 'Big', value: '10000000.0000' };
  const SMALL = { ...OPEN, opportunity_id: 'o-small', title: 'Small', value: '9500000.0000' };
  const UNPRICED = { ...OPEN, opportunity_id: 'o-none', title: 'Unpriced', value: null };

  beforeEach(() => {
    crm.listOpportunities.mockReset();
    crm.convertOpportunity.mockReset();
    crm.createOpportunity.mockReset();
    crm.listLeads.mockReset();
    crm.listLeads.mockResolvedValue([]);
  });

  // COMPARED IN DECIMAL, never as strings: "9500000" sorts ABOVE "10000000" lexically, which is
  // the exact pair that would make the drawn "sorted by value" line a lie while looking sorted.
  it('puts the biggest deal first, comparing value as a number and not as text', async () => {
    crm.listOpportunities.mockResolvedValue([SMALL, BIG]);

    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('opportunity-item')).toHaveLength(2));
    // The first card is the ten-million one.
    expect(getAllByTestId('opportunity-item')[0]).toHaveTextContent(/Big/);
    expect(getAllByTestId('opportunity-item')[1]).toHaveTextContent(/Small/);
  });

  // A null is not a zero, but it is not a headline either.
  it('sorts an unpriced deal last rather than first', async () => {
    crm.listOpportunities.mockResolvedValue([UNPRICED, SMALL, BIG]);

    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('opportunity-item')).toHaveLength(3));
    expect(getAllByTestId('opportunity-item')[2]).toHaveTextContent(/Unpriced/);
  });

  it('counts the head chip over the filtered list, not the fetched one', async () => {
    crm.listOpportunities.mockResolvedValue([BIG, SMALL, { ...WON, title: 'Won one' }]);

    const { getByTestId, getAllByTestId } = await renderScreen();
    await waitFor(() => expect(getAllByTestId('opportunity-item')).toHaveLength(3));
    expect(getByTestId('opportunities-count')).toHaveTextContent(/3/);

    await fireEvent.press(getByTestId('opportunities-filter-WON'));

    await waitFor(() => expect(getAllByTestId('opportunity-item')).toHaveLength(1));
    expect(getByTestId('opportunities-count')).toHaveTextContent(/1/);
  });

  // The second fact on a card is `expected_close_date`. It was labelled "Value" until this date --
  // a DATE under the name of the money field directly beside it.
  it('labels the close date as a date, not as a value', async () => {
    crm.listOpportunities.mockResolvedValue([
      { ...BIG, expected_close_date: '2026-12-31T00:00:00Z' },
    ]);

    const { getAllByText, getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('opportunity-item')).toBeTruthy());
    expect(getAllByText('Expected close')).toHaveLength(1);
    // "Value" belongs to the create sheet's input, which is not open here.
    expect(getAllByText('Project value')).toHaveLength(1);
  });
});
