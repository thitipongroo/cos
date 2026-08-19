// Behaviour of the CRM leads list, pinned before its row is memoized.
//
// /crm/leads carries no LIMIT (backend crm.repository.ts listLeads) — a tenant's lead table grows
// without bound by design — so every lead is rendered. The row's title is a fallback chain
// (company, then contact, then a placeholder) and that is the part a memo on the wrong props gets
// visibly wrong: one lead's company above another lead's status.

import { render, waitFor } from '@testing-library/react-native';
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
});
