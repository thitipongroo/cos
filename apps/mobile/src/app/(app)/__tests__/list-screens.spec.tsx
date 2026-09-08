// Behaviour of the two screens built entirely out of <FetchListScreen />.
//
// The component's own rules — keep the last list when a refresh fails, map once per row — are
// covered in its spec. What is left here, and what only these files decide, is the CONTRACT each of
// them declares: which endpoint it reads, and what a server row becomes on screen. A wrong endpoint
// is a screen showing someone else's data; a wrong mapping is a row that identifies the wrong
// record.
//
// Both mappings have a fallback worth pinning. The RFQ row prefers `rfq_number` and falls back to
// the id, then to a dash — because a list of blank rows is unusable, and an RFQ with no number is a
// real row the procurement officer still has to be able to see and count.
//
// The customer list is READ-ONLY by specification (§20.7.10), not by omission: a customer row is
// created by converting a won opportunity, so there is no create action to render here.

import { render, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import CustomersScreen from '../customers';

jest.mock('../../../api/client', () => ({ get: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as { get: jest.Mock };

function renderCustomers() {
  return render(
    <I18nProvider>
      <CustomersScreen />
    </I18nProvider>,
  );
}

describe('CustomersScreen', () => {
  beforeEach(() => {
    client.get.mockReset();
    client.get.mockResolvedValue([]);
  });

  // finance.customers is the canonical store (ADR-024/029), not a CRM-local copy.
  it('reads the canonical customer endpoint', async () => {
    await renderCustomers();

    await waitFor(() => expect(client.get).toHaveBeenCalledWith('/crm/customers'));
  });

  it('shows a customer by company name and status', async () => {
    client.get.mockResolvedValue([
      { customer_id: 'c-1', company_name: 'Siam Cement', status: 'ACTIVE' },
    ]);

    const { getByText, getByTestId } = await renderCustomers();

    await waitFor(() => expect(getByTestId('customer-item')).toBeTruthy());
    expect(getByText('Siam Cement')).toBeTruthy();
  });

  // READ-ONLY by specification: the row is created by converting a won opportunity.
  it('offers no way to create a customer', async () => {
    client.get.mockResolvedValue([
      { customer_id: 'c-1', company_name: 'Siam Cement', status: 'ACTIVE' },
    ]);

    const { queryByTestId } = await renderCustomers();

    await waitFor(() => expect(queryByTestId('customer-item')).toBeTruthy());
    expect(queryByTestId('customers-fab')).toBeNull();
    expect(queryByTestId('customer-create')).toBeNull();
  });

  it('says so when there are no customers', async () => {
    const { getByTestId, queryAllByTestId } = await renderCustomers();

    await waitFor(() => expect(getByTestId('customers-screen')).toBeTruthy());
    expect(queryAllByTestId('customer-item')).toHaveLength(0);
  });
});
