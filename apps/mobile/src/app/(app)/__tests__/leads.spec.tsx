// Behaviour of the CRM leads list, pinned before its row is memoized.
//
// /crm/leads carries no LIMIT (backend crm.repository.ts listLeads) — a tenant's lead table grows
// without bound by design — so every lead is rendered. The row's title is a fallback chain
// (company, then contact, then a placeholder) and that is the part a memo on the wrong props gets
// visibly wrong: one lead's company above another lead's status.

import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import LeadsScreen from '../leads';

jest.mock('../../../api/crm', () => ({
  listLeads: jest.fn(),
  createLead: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const crm = require('../../../api/crm') as { listLeads: jest.Mock; createLead: jest.Mock };

const WITH_BOTH = {
  lead_id: 'l-1',
  contact_name: 'Somchai P.',
  company: 'Riverside Construction',
  status: 'NEW',
  source: null,
  assigned_to: null,
  created_at: '2026-08-19T00:00:00Z',
};

const CONTACT_ONLY = { ...WITH_BOTH, lead_id: 'l-2', company: null, contact_name: 'Malee S.' };
const NEITHER = { ...WITH_BOTH, lead_id: 'l-3', company: null, contact_name: null };

function renderScreen() {
  return render(
    <I18nProvider>
      <LeadsScreen />
    </I18nProvider>,
  );
}

describe('LeadsScreen', () => {
  beforeEach(() => {
    crm.listLeads.mockReset();
    crm.createLead.mockReset();
  });

  it('renders one row per lead', async () => {
    crm.listLeads.mockResolvedValue([WITH_BOTH, CONTACT_ONLY]);

    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('lead-item')).toHaveLength(2));
  });

  it('titles a lead by its company, and shows the contact beneath when both exist', async () => {
    crm.listLeads.mockResolvedValue([WITH_BOTH]);

    const { getByText } = await renderScreen();

    await waitFor(() => expect(getByText('Riverside Construction')).toBeTruthy());
    expect(getByText('Somchai P.')).toBeTruthy();
  });

  it('falls back to the contact name when a lead has no company', async () => {
    crm.listLeads.mockResolvedValue([CONTACT_ONLY]);

    const { getByText, getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('lead-item')).toHaveLength(1));
    expect(getByText('Malee S.')).toBeTruthy();
  });

  it('still renders a lead that has neither a company nor a contact', async () => {
    crm.listLeads.mockResolvedValue([NEITHER]);

    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('lead-item')).toHaveLength(1));
  });

  it('keeps the screen usable when the request fails offline', async () => {
    crm.listLeads.mockRejectedValue(new Error('offline'));

    const { getByTestId, queryAllByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('leads-screen')).toBeTruthy());
    expect(queryAllByTestId('lead-item')).toHaveLength(0);
  });

  // ── CAPTURING A LEAD ─────────────────────────────────────────────────────────────────────────
  //
  // CREATE IS THE POINT OF THIS SCREEN BEING ON A PHONE AT ALL. A lead arrives as a phone call or a
  // conversation at the site gate, and the capture has to happen before the details are lost.
  //
  // EVERY FIELD ON CreateLeadDto IS OPTIONAL SERVER-SIDE, so the only rule enforced anywhere is the
  // one enforced here: say WHO or WHICH COMPANY. A lead with neither is a row nobody can follow up,
  // and the server would accept it — the list already shows what that looks like, a card reading
  // "Untitled lead" that can never become an opportunity.

  it('captures a lead from the company alone', async () => {
    crm.listLeads.mockResolvedValue([]);
    crm.createLead.mockResolvedValue(WITH_BOTH);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('create-lead-button')).toBeTruthy());

    await fireEvent.changeText(getByTestId('lead-company-input'), 'Riverside Construction');
    await fireEvent.press(getByTestId('create-lead-button'));

    await waitFor(() => expect(crm.createLead).toHaveBeenCalledTimes(1));
    // The empty half is OMITTED rather than sent as '': the column stays null instead of holding a
    // blank string that later reads as a contact somebody typed and left empty.
    expect(crm.createLead).toHaveBeenCalledWith({ company: 'Riverside Construction' });
  });

  it('captures a lead from the contact alone', async () => {
    crm.listLeads.mockResolvedValue([]);
    crm.createLead.mockResolvedValue(CONTACT_ONLY);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('create-lead-button')).toBeTruthy());

    await fireEvent.changeText(getByTestId('lead-contact-input'), 'Malee S.');
    await fireEvent.press(getByTestId('create-lead-button'));

    await waitFor(() => expect(crm.createLead).toHaveBeenCalledTimes(1));
    expect(crm.createLead).toHaveBeenCalledWith({ contact_name: 'Malee S.' });
  });

  it('sends both when both were given', async () => {
    crm.listLeads.mockResolvedValue([]);
    crm.createLead.mockResolvedValue(WITH_BOTH);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('create-lead-button')).toBeTruthy());

    await fireEvent.changeText(getByTestId('lead-contact-input'), '  Somchai P.  ');
    await fireEvent.changeText(getByTestId('lead-company-input'), 'Riverside Construction');
    await fireEvent.press(getByTestId('create-lead-button'));

    await waitFor(() => expect(crm.createLead).toHaveBeenCalledTimes(1));
    // Trimmed: the padding is a keyboard artefact, not part of anybody's name.
    expect(crm.createLead).toHaveBeenCalledWith({
      contact_name: 'Somchai P.',
      company: 'Riverside Construction',
    });
  });

  // The one rule this screen enforces, and the server does not.
  it('will not capture a lead with neither', async () => {
    crm.listLeads.mockResolvedValue([]);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('create-lead-button')).toBeTruthy());

    expect(getByTestId('create-lead-button').props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(getByTestId('create-lead-button'));

    expect(crm.createLead).not.toHaveBeenCalled();
  });

  it('treats fields of whitespace as neither', async () => {
    crm.listLeads.mockResolvedValue([]);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('create-lead-button')).toBeTruthy());

    await fireEvent.changeText(getByTestId('lead-contact-input'), '   ');
    await fireEvent.changeText(getByTestId('lead-company-input'), '  ');

    expect(getByTestId('create-lead-button').props.accessibilityState.disabled).toBe(true);
  });

  // PREPEND RATHER THAN REFETCH. The list is ordered created_at DESC so the new row belongs at the
  // top — and the user sees the capture land even if the network drops immediately afterwards,
  // which on a site is the ordinary case.
  it('puts the new lead at the top without a refetch', async () => {
    crm.listLeads.mockResolvedValue([CONTACT_ONLY]);
    crm.createLead.mockResolvedValue(WITH_BOTH);

    const { getByTestId, getAllByTestId, getByText } = await renderScreen();
    await waitFor(() => expect(getAllByTestId('lead-item')).toHaveLength(1));

    await fireEvent.changeText(getByTestId('lead-company-input'), 'Riverside Construction');
    await fireEvent.press(getByTestId('create-lead-button'));

    await waitFor(() => expect(getAllByTestId('lead-item')).toHaveLength(2));
    expect(getByText('Riverside Construction')).toBeTruthy();
    // ONE call: the list was not refetched, which is what makes the row appear with no signal.
    expect(crm.listLeads).toHaveBeenCalledTimes(1);
  });

  it('empties the form once the lead is captured', async () => {
    crm.listLeads.mockResolvedValue([]);
    crm.createLead.mockResolvedValue(WITH_BOTH);

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('create-lead-button')).toBeTruthy());

    await fireEvent.changeText(getByTestId('lead-contact-input'), 'Somchai P.');
    await fireEvent.changeText(getByTestId('lead-company-input'), 'Riverside Construction');
    await fireEvent.press(getByTestId('create-lead-button'));

    await waitFor(() => expect(getByTestId('lead-contact-input').props.value).toBe(''));
    expect(getByTestId('lead-company-input').props.value).toBe('');
  });

  // ONLINE-ONLY, and a failure has to SURFACE IMMEDIATELY (api/crm uses post(), not mutate()): a
  // lead replayed later has no ordering hazard worth the queue's complexity, and what the user needs
  // instead is to know at once so they can fall back to writing it down.
  //
  // So the form KEEPS what was typed. Clearing it on a failed POST would throw away the details the
  // whole screen exists to catch, at the moment they are hardest to recover.
  it('keeps what was typed when the capture fails', async () => {
    crm.listLeads.mockResolvedValue([]);
    crm.createLead.mockRejectedValue(new Error('offline'));

    const { getByTestId, queryAllByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('create-lead-button')).toBeTruthy());

    await fireEvent.changeText(getByTestId('lead-company-input'), 'Riverside Construction');
    await fireEvent.press(getByTestId('create-lead-button'));

    await waitFor(() => expect(crm.createLead).toHaveBeenCalled());
    expect(getByTestId('lead-company-input').props.value).toBe('Riverside Construction');
    // NO FABRICATED SUCCESS: the row does not appear, which is how the failure shows.
    expect(queryAllByTestId('lead-item')).toHaveLength(0);
  });

  it('offers the capture again after a failure', async () => {
    crm.listLeads.mockResolvedValue([]);
    crm.createLead.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('create-lead-button')).toBeTruthy());

    await fireEvent.changeText(getByTestId('lead-company-input'), 'Riverside Construction');
    await fireEvent.press(getByTestId('create-lead-button'));

    await waitFor(() =>
      expect(getByTestId('create-lead-button').props.accessibilityState.disabled).toBe(false),
    );
  });

  // A second press while one is in flight would capture the same lead twice — and this screen has no
  // client id and no idempotency, so the duplicate is a real second row in the pipeline.
  it('refuses a second press while the capture is in flight', async () => {
    crm.listLeads.mockResolvedValue([]);
    crm.createLead.mockReturnValue(new Promise(() => undefined));

    const { getByTestId } = await renderScreen();
    await waitFor(() => expect(getByTestId('create-lead-button')).toBeTruthy());

    await fireEvent.changeText(getByTestId('lead-company-input'), 'Riverside Construction');
    void fireEvent.press(getByTestId('create-lead-button'));
    await waitFor(() => expect(crm.createLead).toHaveBeenCalledTimes(1));

    expect(getByTestId('create-lead-button').props.accessibilityState.disabled).toBe(true);

    void fireEvent.press(getByTestId('create-lead-button'));

    expect(crm.createLead).toHaveBeenCalledTimes(1);
  });

  // ── THE LIST ─────────────────────────────────────────────────────────────────────────────────

  // The last list is KEPT rather than blanked: a sales manager scrolling their pipeline when the
  // signal drops should not have it replaced by an empty screen.
  it('keeps the leads already on screen when a refresh fails', async () => {
    crm.listLeads.mockResolvedValueOnce([WITH_BOTH]);

    const { getAllByTestId, getByTestId } = await renderScreen();
    await waitFor(() => expect(getAllByTestId('lead-item')).toHaveLength(1));

    crm.listLeads.mockRejectedValue(new Error('offline'));
    // `onRefresh` lives on the FlatList's `refreshControl` prop, which is a React ELEMENT and not a
    // rendered node — `fireEvent` at the list, or at the element, finds no handler and passes
    // silently as "nothing happened". Invoking the handler the list was actually given is the real
    // pull-to-refresh path.
    const refresh = (
      getByTestId('lead-list').props as { refreshControl: { props: { onRefresh: () => void } } }
    ).refreshControl.props.onRefresh;
    await act(async () => {
      refresh();
    });

    await waitFor(() => expect(crm.listLeads).toHaveBeenCalledTimes(2));
    expect(getAllByTestId('lead-item')).toHaveLength(1);
  });

  // The status drives the NEXT STEP: only a NEW/QUALIFIED lead is a candidate for an opportunity,
  // and the Opportunities screen filters on exactly that. A row without it is a row whose next
  // action cannot be worked out from the list.
  it('shows the status on every row', async () => {
    crm.listLeads.mockResolvedValue([
      { ...WITH_BOTH, lead_id: 'l-1', status: 'NEW' },
      { ...WITH_BOTH, lead_id: 'l-2', status: 'QUALIFIED' },
    ]);

    const { getByText } = await renderScreen();

    await waitFor(() => expect(getByText('NEW')).toBeTruthy());
    expect(getByText('QUALIFIED')).toBeTruthy();
  });
});
