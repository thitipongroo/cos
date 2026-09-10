// Customers screen — CRM_SALES_MANAGER (mockup 12_crm_manager/07_customers/01_crm_customers).
//
// The first four assertions here lived in `list-screens.spec.tsx` until 2026-09-10, because the
// screen WAS a list screen: a `<FetchListScreen />` printing a company and a status. It is now a
// searchable card list with a drawn relationship panel, so those tests moved here with it and the
// shared file — by then holding nothing else — was deleted. `rfqs.spec.tsx` records the same move
// for the same reason on 2026-09-08; this is the second and last of that file's two screens.
//
// THE CONTRACT THAT ONLY THIS FILE DECIDES is which endpoint the screen reads and what a server row
// becomes on screen. A wrong endpoint is a screen showing someone else's data; a wrong mapping is a
// row that identifies the wrong record.
//
// The list is READ-ONLY by specification (§20.7.10), not by omission: a customer row is created by
// converting a won opportunity, so there is no create action to render here.
//
// WHAT THESE TESTS DELIBERATELY DO NOT PIN is the value of a drawn figure — the tier letters, the
// trust index, the credit terms. Those live in `lib/mockupFigures.ts` (ADR-099) and change when the
// drawing does. What is pinned is that a drawn figure is drawn CONSISTENTLY per row position, and
// that no drawn figure is ever substituted for a real one that is missing.

import { Alert } from 'react-native';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import { CUSTOMER_DETAIL, CUSTOMER_RELATIONSHIP } from '../../../lib/mockupFigures';
import CustomersScreen from '../customers';

jest.mock('../../../api/client', () => ({ get: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as { get: jest.Mock };

const SIAM = {
  customer_id: 'c-1',
  opportunity_id: 'o-1',
  company_name: 'Siam Cement',
  customer_type: null,
  status: 'ACTIVE',
  created_at: '2026-08-19T00:00:00Z',
};

const HARBOUR = {
  ...SIAM,
  customer_id: 'c-2',
  company_name: 'Harbour Works',
  customer_type: 'State enterprise',
};

function renderCustomers() {
  return render(
    <I18nProvider>
      <CustomersScreen />
    </I18nProvider>,
  );
}

describe('CustomersScreen', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    client.get.mockReset();
    client.get.mockResolvedValue([]);
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    alert.mockRestore();
  });

  // finance.customers is the canonical store (ADR-024/029), not a CRM-local copy.
  it('reads the canonical customer endpoint', async () => {
    await renderCustomers();

    await waitFor(() => expect(client.get).toHaveBeenCalledWith('/crm/customers'));
  });

  it('shows a customer by company name and status', async () => {
    client.get.mockResolvedValue([SIAM]);

    const { getByText, getByTestId } = await renderCustomers();

    await waitFor(() => expect(getByTestId('customer-item')).toBeTruthy());
    expect(getByText('Siam Cement')).toBeTruthy();
    expect(getByText('Active')).toBeTruthy();
  });

  // READ-ONLY by specification: the row is created by converting a won opportunity.
  it('offers no way to create a customer', async () => {
    client.get.mockResolvedValue([SIAM]);

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

  // `customer_type` is nullable and IS null for every customer this product creates — the CRM
  // insert sets tenant, opportunity, company and status and nothing else. The card must draw
  // nothing there: not a dash, not a placeholder, and above all not the status, which would put one
  // fact under two labels and make the card look like it knows more than it does.
  it('draws no type line at all when the server sends none', async () => {
    client.get.mockResolvedValue([SIAM]);

    const { getAllByText, getByTestId, queryByText } = await renderCustomers();

    await waitFor(() => expect(getByTestId('customer-item')).toBeTruthy());
    expect(queryByText('—')).toBeNull();
    expect(queryByText('-')).toBeNull();
    // "Active" appears ONCE — as the status chip. Twice would mean the status had been substituted
    // into the type line as well, which is the specific mistake this test exists to catch.
    expect(getAllByText('Active')).toHaveLength(1);
  });

  it('shows the type when the server does send one', async () => {
    client.get.mockResolvedValue([HARBOUR]);

    const { getByText } = await renderCustomers();

    await waitFor(() => expect(getByText('State enterprise')).toBeTruthy());
  });

  it('searches by company name', async () => {
    client.get.mockResolvedValue([SIAM, HARBOUR]);

    const { getAllByTestId, getByTestId, queryByText } = await renderCustomers();
    await waitFor(() => expect(getAllByTestId('customer-item')).toHaveLength(2));

    await fireEvent.changeText(getByTestId('customers-search'), 'harbour');

    await waitFor(() => expect(getAllByTestId('customer-item')).toHaveLength(1));
    expect(queryByText('Siam Cement')).toBeNull();
  });

  // The chip counts CUSTOMERS, not search results: it is the answer to "how many clients are
  // there", which a search must not change.
  it('keeps the count on the whole list while a search narrows the view', async () => {
    client.get.mockResolvedValue([SIAM, HARBOUR]);

    const { getAllByTestId, getByTestId } = await renderCustomers();
    await waitFor(() => expect(getAllByTestId('customer-item')).toHaveLength(2));

    await fireEvent.changeText(getByTestId('customers-search'), 'harbour');

    await waitFor(() => expect(getAllByTestId('customer-item')).toHaveLength(1));
    // A regex, not a string: `toHaveTextContent` matches a string EXACTLY, and the chip's own text
    // is its glyph, its label and the number run together.
    expect(getByTestId('customers-count')).toHaveTextContent(/2/);
  });

  // The avatar is COMPUTED from the company's own name, not drawn — no customer record carries an
  // image, and inventing a logo would be a claim about a real company.
  it('builds the avatar plate out of the company initials', async () => {
    client.get.mockResolvedValue([SIAM]);

    const { getByText } = await renderCustomers();

    await waitFor(() => expect(getByText('SC')).toBeTruthy());
  });

  it('carries the drawn relationship figures, and no confidence it did not compute', async () => {
    client.get.mockResolvedValue([SIAM]);

    const { getByTestId, getByText, queryByText } = await renderCustomers();

    await waitFor(() => expect(getByTestId('customers-relationship')).toBeTruthy());
    expect(getByText(String(CUSTOMER_RELATIONSHIP.value.trustIndex))).toBeTruthy();
    expect(getByText(CUSTOMER_RELATIONSHIP.value.repeatRate)).toBeTruthy();
    // No model produced these figures, so the foot draws no CONF half (ADR-099 third amendment).
    expect(queryByText(/CONF/)).toBeNull();
  });

  // Drawn detail is chosen by ROW POSITION, so the same list renders the same figures every time —
  // a card whose tier changed between renders would read as live data.
  it('gives each row position its own drawn detail, stably', async () => {
    client.get.mockResolvedValue([SIAM, HARBOUR]);

    const { getByText } = await renderCustomers();

    await waitFor(() => expect(getByText(CUSTOMER_DETAIL.value[0]!.tier)).toBeTruthy());
    expect(getByText(CUSTOMER_DETAIL.value[1]!.tier)).toBeTruthy();
    expect(getByText(CUSTOMER_DETAIL.value[0]!.terms)).toBeTruthy();
  });

  it('says the history view is not built yet rather than pretending to open it', async () => {
    client.get.mockResolvedValue([SIAM]);

    const { getByTestId } = await renderCustomers();
    await waitFor(() => expect(getByTestId('customer-history-c-1')).toBeTruthy());

    await fireEvent.press(getByTestId('customer-history-c-1'));

    expect(alert).toHaveBeenCalledWith('View history', expect.any(String));
  });

  it('says the extra filters are not built yet rather than pretending to open them', async () => {
    const { getByTestId } = await renderCustomers();
    await waitFor(() => expect(getByTestId('customers-tune')).toBeTruthy());

    await fireEvent.press(getByTestId('customers-tune'));

    expect(alert).toHaveBeenCalledWith('More filters', expect.any(String));
  });

  // Offline, the screen keeps the rows it already has instead of emptying itself — an empty list
  // and a failed refresh look identical to a reader, and only one of them means "no customers".
  it('keeps the list it has when a refresh fails', async () => {
    client.get.mockResolvedValueOnce([SIAM]);

    const { getAllByTestId, getByTestId } = await renderCustomers();
    await waitFor(() => expect(getAllByTestId('customer-item')).toHaveLength(1));

    client.get.mockRejectedValueOnce(new Error('offline'));
    // `onRefresh` lives on the FlatList's `refreshControl` prop, which is a React ELEMENT and not a
    // rendered node — `fireEvent` at the list finds no handler and passes silently as "nothing
    // happened". Invoking the handler the list was actually given is the real pull-to-refresh path.
    const refresh = (
      getByTestId('customer-list').props as {
        refreshControl: { props: { onRefresh: () => void } };
      }
    ).refreshControl.props.onRefresh;
    await act(async () => {
      refresh();
    });

    await waitFor(() => expect(client.get).toHaveBeenCalledTimes(2));
    expect(getAllByTestId('customer-item')).toHaveLength(1);
  });
});
