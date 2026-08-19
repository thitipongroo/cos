// Proves a real SCREEN renders under the render project — the class of file items 3-6 refactor.
// Kept deliberately behavioural: what a PROCUREMENT user sees for a list of purchase orders.

import { render, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import OrdersScreen from '../orders';

jest.mock('../../../api/client', () => ({
  get: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { get } = require('../../../api/client') as { get: jest.Mock };

function renderScreen() {
  return render(
    <I18nProvider>
      <OrdersScreen />
    </I18nProvider>,
  );
}

describe('OrdersScreen', () => {
  beforeEach(() => {
    get.mockReset();
  });

  it('renders one row per purchase order returned by the API', async () => {
    get.mockResolvedValue({
      items: [
        { po_id: 'po-1', po_number: 'PO-0001', status: 'SENT' },
        { po_id: 'po-2', po_number: 'PO-0002', status: 'ACKNOWLEDGED' },
      ],
    });

    const { getByText } = await renderScreen();

    await waitFor(() => {
      expect(getByText('PO-0001')).toBeTruthy();
    });
    expect(getByText('PO-0002')).toBeTruthy();
  });

  it('stays on screen when the list request fails offline', async () => {
    get.mockRejectedValue(new Error('offline'));

    const { queryByText } = await renderScreen();

    await waitFor(() => {
      expect(queryByText('PO-0001')).toBeNull();
    });
  });
});
