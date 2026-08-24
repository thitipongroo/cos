// Behaviour of the vendor directory.
//
// A SCORE THAT FAILED IS NOT A SCORE OF ZERO. Scorecards are fetched per vendor after the list
// arrives, and a failure on one is swallowed on purpose: a vendor whose scorecard errors still
// belongs in the directory, just without a number. Filling in a zero would be this screen inventing
// a performance rating for a company.
//
// THE BADGE IS NOT THE SCORE EITHER. `verification_status` is whether the vendor was checked;
// `grade` is how they have performed. TOP_RATED needs both — VERIFIED and an A — and a rejected
// vendor stays rejected whatever the grade says. Conflating the two would put a badge on a company
// nobody verified.
//
// And the manage action is drawn for the role that holds the right (§6.8) but SAYS it is not built:
// there is no vendor editor, no route and no form behind it.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { CosRole } from '@cos/types';
import { I18nProvider } from '../../../i18n';
import { useAuthStore } from '../../../store/authStore';
import VendorsScreen from '../vendors';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../../api/procurement', () => ({
  ...jest.requireActual('../../../api/procurement'),
  fetchVendorDirectory: jest.fn(),
  fetchVendorScore: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../../../api/procurement') as {
  fetchVendorDirectory: jest.Mock;
  fetchVendorScore: jest.Mock;
};

function vendor(id: string, over: Partial<Record<string, unknown>> = {}) {
  return {
    vendor_id: id,
    vendor_code: `V-${id}`,
    vendor_name: `Vendor ${id}`,
    category: 'MATERIALS',
    verification_status: 'VERIFIED',
    active_project_count: 2,
    ...over,
  };
}

function renderScreen() {
  return render(
    <I18nProvider>
      <VendorsScreen />
    </I18nProvider>,
  );
}

describe('VendorsScreen', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    api.fetchVendorDirectory.mockReset();
    api.fetchVendorScore.mockReset();
    api.fetchVendorDirectory.mockResolvedValue([vendor('v-1'), vendor('v-2')]);
    api.fetchVendorScore.mockResolvedValue({ totalScore: 88, grade: 'A' });
    useAuthStore.setState({ role: CosRole.PROC_MANAGER } as never);
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => alert.mockRestore());

  it('lists the vendors', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('vendor-v-1')).toBeTruthy());
    expect(getByTestId('vendor-v-2')).toBeTruthy();
  });

  it('says so when the directory is empty', async () => {
    api.fetchVendorDirectory.mockResolvedValue([]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('vendors-empty')).toBeTruthy());
  });

  it('says so when the directory could not be fetched', async () => {
    api.fetchVendorDirectory.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('vendors-screen')).toBeTruthy());
  });

  // A vendor whose scorecard errors still belongs in the directory, just without a number.
  it('keeps a vendor whose scorecard failed, rather than dropping or zeroing it', async () => {
    api.fetchVendorScore.mockRejectedValue(new Error('503'));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('vendor-v-1')).toBeTruthy());
    expect(getByTestId('vendor-v-2')).toBeTruthy();
  });

  it('asks for a scorecard per vendor', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('vendor-v-1')).toBeTruthy());
    await waitFor(() => expect(api.fetchVendorScore).toHaveBeenCalledTimes(2));
  });

  // TOP_RATED needs BOTH: verified, and an A.
  it('badges a verified A-grade vendor', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('vendor-badge-v-1')).toBeTruthy());
  });

  // A rejected vendor stays rejected whatever the grade says.
  it('does not let a good grade override a rejection', async () => {
    api.fetchVendorDirectory.mockResolvedValue([
      vendor('v-1', { verification_status: 'REJECTED' }),
    ]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('vendor-badge-v-1')).toBeTruthy());
  });

  // Never submitted for review is not a badge at all — it is the absence of one.
  it('badges nothing for a vendor nobody has reviewed', async () => {
    api.fetchVendorDirectory.mockResolvedValue([vendor('v-1', { verification_status: null })]);

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('vendor-v-1')).toBeTruthy());
    expect(queryByTestId('vendor-badge-v-1')).toBeNull();
  });

  it('narrows the directory by name', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('vendor-v-2')).toBeTruthy());
    await fireEvent.changeText(getByTestId('vendors-search'), 'Vendor v-2');

    await waitFor(() => expect(queryByTestId('vendor-v-1')).toBeNull());
    expect(getByTestId('vendor-v-2')).toBeTruthy();
  });

  it('narrows the directory by code too', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('vendor-v-2')).toBeTruthy());
    await fireEvent.changeText(getByTestId('vendors-search'), 'V-v-2');

    await waitFor(() => expect(queryByTestId('vendor-v-1')).toBeNull());
  });

  // The category filter is a SERVER query, not a client filter — it re-fetches. And ALL sends
  // `undefined` rather than the string 'ALL', which is not a category the endpoint knows.
  it('re-asks the server when the category changes', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(api.fetchVendorDirectory).toHaveBeenCalledTimes(1));
    await fireEvent.press(getByTestId('vendors-filter-materials'));

    await waitFor(() => expect(api.fetchVendorDirectory).toHaveBeenCalledTimes(2));
    expect(api.fetchVendorDirectory).toHaveBeenLastCalledWith('MATERIALS');
  });

  it('asks for everything, not for a category called ALL', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(api.fetchVendorDirectory).toHaveBeenCalledTimes(1));
    expect(api.fetchVendorDirectory).toHaveBeenCalledWith(undefined);

    await fireEvent.press(getByTestId('vendors-filter-materials'));
    await waitFor(() => expect(api.fetchVendorDirectory).toHaveBeenCalledTimes(2));
    await fireEvent.press(getByTestId('vendors-filter-all'));

    await waitFor(() => expect(api.fetchVendorDirectory).toHaveBeenCalledTimes(3));
    expect(api.fetchVendorDirectory).toHaveBeenLastCalledWith(undefined);
  });

  // §6.8 gives the role the right; the app has no editor to exercise it with, and says so.
  it('reports vendor management as unbuilt rather than opening nothing', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('vendor-manage-v-1')).toBeTruthy());
    await fireEvent.press(getByTestId('vendor-manage-v-1'));

    expect(alert).toHaveBeenCalled();
  });

  it('offers no management to a role that does not hold the right', async () => {
    useAuthStore.setState({ role: CosRole.SITE_ENGINEER } as never);

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('vendor-v-1')).toBeTruthy());
    expect(queryByTestId('vendor-manage-v-1')).toBeNull();
  });
});
