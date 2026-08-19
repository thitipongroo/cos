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
});
