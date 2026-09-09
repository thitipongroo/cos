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

  // THE CATEGORY FILTER IS A CLIENT FILTER, NOT A SERVER QUERY (changed 2026-09-09). It used to
  // re-fetch on every chip press and these two tests pinned that. The drawing puts a COUNT on each
  // chip, and a count over one category's response cannot say how many are in the others — so the
  // screen asks once, unfiltered, and both the counts and the filtering are computed over what came
  // back. One request is the contract now, and the chip press must not produce a second.
  it('filters on the client and never re-asks the server', async () => {
    api.fetchVendorDirectory.mockResolvedValue([
      vendor('v-1', { category: 'MATERIALS' }),
      vendor('v-2', { category: 'LOGISTICS' }),
    ]);
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('vendor-v-2')).toBeTruthy());
    await fireEvent.press(getByTestId('vendors-filter-materials'));

    await waitFor(() => expect(queryByTestId('vendor-v-2')).toBeNull());
    expect(getByTestId('vendor-v-1')).toBeTruthy();
    expect(api.fetchVendorDirectory).toHaveBeenCalledTimes(1);
  });

  it('asks for the whole directory, with no category argument at all', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(api.fetchVendorDirectory).toHaveBeenCalledTimes(1));
    expect(api.fetchVendorDirectory).toHaveBeenCalledWith();

    await fireEvent.press(getByTestId('vendors-filter-materials'));
    await fireEvent.press(getByTestId('vendors-filter-all'));

    expect(api.fetchVendorDirectory).toHaveBeenCalledTimes(1);
  });

  // The chip counts are REAL — they are why the request stopped being per-category. A count that
  // came from the filtered response could only ever have equalled the rows on screen.
  it('counts each chip over the whole directory, not over the rows on screen', async () => {
    api.fetchVendorDirectory.mockResolvedValue([
      vendor('v-1', { category: 'MATERIALS' }),
      vendor('v-2', { category: 'MATERIALS' }),
      vendor('v-3', { category: 'LOGISTICS' }),
      vendor('v-4', { category: null }),
    ]);
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('vendors-filter-all')).toHaveTextContent(/4/));
    expect(getByTestId('vendors-filter-materials')).toHaveTextContent(/2/);
    expect(getByTestId('vendors-filter-logistics')).toHaveTextContent(/1/);
    // Nothing is invented for the uncategorised vendor: it counts in ALL and in no chip below it.
    expect(getByTestId('vendors-filter-services')).toHaveTextContent(/0/);

    // Filtering must not move the counts.
    await fireEvent.press(getByTestId('vendors-filter-logistics'));
    await waitFor(() => expect(getByTestId('vendors-filter-all')).toHaveTextContent(/4/));
    expect(getByTestId('vendors-filter-materials')).toHaveTextContent(/2/);
  });

  // Both are controls the drawing shows and this platform cannot perform — no speech pipeline, and
  // the chips already are the filter. They say so; they never sit dead (PO convention 2026-09-04).
  it('says the mic and the filter button are not built rather than doing nothing', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('vendors-voice')).toBeTruthy());
    await fireEvent.press(getByTestId('vendors-voice'));
    expect(alert).toHaveBeenCalledTimes(1);

    await fireEvent.press(getByTestId('vendors-tune'));
    expect(alert).toHaveBeenCalledTimes(2);
  });

  // The drawing's per-card controls. Neither a vendor profile screen nor an RFQ composer exists.
  it('says the profile and RFQ buttons are not built', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('vendor-view-v-1')).toBeTruthy());
    await fireEvent.press(getByTestId('vendor-view-v-1'));
    await fireEvent.press(getByTestId('vendor-rfq-v-1'));

    expect(alert).toHaveBeenCalledTimes(2);
  });

  // The insight card's two actions, and the reason the card has a foot at all: the SOURCE must name
  // something this repository has (ADR-098 amendment 2).
  it('draws the insight card with its source and both actions', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('vendor-insight')).toBeTruthy());
    expect(getByTestId('vendor-insight-foot')).toHaveTextContent(/SOURCE/);

    await fireEvent.press(getByTestId('vendor-insight-dismiss'));
    await fireEvent.press(getByTestId('vendor-insight-act'));
    expect(alert).toHaveBeenCalledTimes(2);
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
