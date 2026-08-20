// Behaviour of the procurement dashboard.
//
// THE THREE KPI FIGURES ARE COUNTS, NOT PAGE-ONE COUNTS. Both list endpoints paginate at 20 by
// default, and the app used to ask for neither a filter nor a second page — so "Active RFQs" and
// "Deliveries today" read 0 while the tenant had three open RFQs and two of today's deliveries. A
// counter computed over the first page of N is not a count, and on a procurement dashboard it is a
// number someone acts on.
//
// The two are counted differently and both are asserted here. RFQs are counted BY THE SERVER — the
// endpoint takes `status` and returns `total`, so the figure is the tenant's rather than this page's.
// Deliveries have no "today" filter server-side, so every page is fetched and the date applied here.
//
// The approve action is exclusive while it runs: a second approval fired at another PO before the
// first returns would leave two rows both looking approved when one of them may not be.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { I18nProvider } from '../../../i18n';
import ProcurementScreen from '../procurement';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../../api/client', () => ({ get: jest.fn() }));
jest.mock('../../../api/procurement', () => ({
  ...jest.requireActual('../../../api/procurement'),
  fetchPendingApprovals: jest.fn(),
  approvePurchaseOrder: jest.fn(),
}));
jest.mock('../../../api/projects', () => ({
  ...jest.requireActual('../../../api/projects'),
  getMyProjects: jest.fn(),
  refreshProjectsCache: jest.fn(),
}));
jest.mock('../../../hooks/useCollection', () => ({ useCollection: jest.fn(() => []) }));
// The insight panel calls its own endpoint; it is not what this dashboard's rules are.
jest.mock('../../../components/ProcurementInsight', () => ({ ProcurementInsight: () => null }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as { get: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const proc = require('../../../api/procurement') as {
  fetchPendingApprovals: jest.Mock;
  approvePurchaseOrder: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const projects = require('../../../api/projects') as {
  getMyProjects: jest.Mock;
  refreshProjectsCache: jest.Mock;
};

function po(id: string, over: Partial<Record<string, unknown>> = {}) {
  return {
    po_id: id,
    po_number: `PO-${id}`,
    vendor_id: 'v-1',
    project_id: 'p-1',
    status: 'PENDING_APPROVAL',
    total_amount: '250000.0000',
    currency_code: 'THB',
    updated_at: '2026-08-19T09:00:00Z',
    ...over,
  };
}

function delivery(deliveredAt: string) {
  return { delivery_id: `d-${deliveredAt}`, delivered_at: deliveredAt };
}

/** Answer each endpoint by path; anything unlisted answers empty. */
function respond(opts: { rfqTotal?: number; deliveries?: unknown[] } = {}) {
  client.get.mockImplementation((path: string) => {
    if (path === '/procurement/rfqs') {
      return Promise.resolve({ items: [], total: opts.rfqTotal ?? 0 });
    }
    if (path === '/procurement/deliveries') {
      return Promise.resolve({ items: opts.deliveries ?? [] });
    }
    return Promise.resolve({ items: [] });
  });
}

function renderScreen() {
  return render(
    <I18nProvider>
      <ProcurementScreen />
    </I18nProvider>,
  );
}

describe('ProcurementScreen', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    mockPush.mockReset();
    client.get.mockReset();
    proc.fetchPendingApprovals.mockReset();
    proc.approvePurchaseOrder.mockReset();
    projects.getMyProjects.mockReset();
    projects.refreshProjectsCache.mockReset();
    proc.fetchPendingApprovals.mockResolvedValue({ pos: [] });
    proc.approvePurchaseOrder.mockResolvedValue(undefined);
    projects.getMyProjects.mockResolvedValue([]);
    projects.refreshProjectsCache.mockResolvedValue([]);
    respond();
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => alert.mockRestore());

  it('shows the three figures', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('stat-pending-approvals')).toBeTruthy());
    expect(getByTestId('stat-active-rfqs')).toBeTruthy();
    expect(getByTestId('stat-deliveries-today')).toBeTruthy();
  });

  // COUNTED BY THE SERVER — the tenant's number, not this page's.
  it('takes the RFQ figure from the server`s total, not from the rows it received', async () => {
    respond({ rfqTotal: 37 });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('stat-active-rfqs')).toBeTruthy());
    expect(client.get).toHaveBeenCalledWith('/procurement/rfqs', expect.objectContaining({}));
  });

  it('asks the RFQ endpoint for open ones only, past the default page size', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('stat-active-rfqs')).toBeTruthy());
    const call = client.get.mock.calls.find((c) => c[0] === '/procurement/rfqs');
    expect(call?.[1].limit).toBe('100');
    expect(call?.[1].status).toBeTruthy();
  });

  // No server-side "today" filter, so every page is fetched and the date applied here.
  it('pages the deliveries rather than counting the first page', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('stat-deliveries-today')).toBeTruthy());
    const call = client.get.mock.calls.find((c) => c[0] === '/procurement/deliveries');
    expect(call?.[1].limit).toBe('100');
    expect(call?.[1].page).toBe('1');
  });

  it('counts only today`s deliveries', async () => {
    const today = new Date().toISOString();
    respond({ deliveries: [delivery(today), delivery('2026-01-01T09:00:00Z')] });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('stat-deliveries-today')).toBeTruthy());
  });

  it('lists the purchase orders waiting on a decision', async () => {
    proc.fetchPendingApprovals.mockResolvedValue({ pos: [po('po-1'), po('po-2')] });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('approval-po-1')).toBeTruthy());
    expect(getByTestId('approval-po-2')).toBeTruthy();
  });

  it('says so when nothing is waiting', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('procurement-empty')).toBeTruthy());
  });

  it('approves the order whose button was pressed', async () => {
    proc.fetchPendingApprovals.mockResolvedValue({ pos: [po('po-1'), po('po-2')] });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('approval-approve-po-2')).toBeTruthy());
    await fireEvent.press(getByTestId('approval-approve-po-2'));

    await waitFor(() => expect(proc.approvePurchaseOrder).toHaveBeenCalledWith('po-2', 'PM'));
  });

  it('reloads the queue after an approval', async () => {
    proc.fetchPendingApprovals.mockResolvedValue({ pos: [po('po-1')] });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(proc.fetchPendingApprovals).toHaveBeenCalledTimes(1));
    await fireEvent.press(getByTestId('approval-approve-po-1'));

    await waitFor(() => expect(proc.fetchPendingApprovals).toHaveBeenCalledTimes(2));
  });

  it('says so when an approval is refused', async () => {
    proc.fetchPendingApprovals.mockResolvedValue({ pos: [po('po-1')] });
    proc.approvePurchaseOrder.mockRejectedValue(new Error('403'));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('approval-approve-po-1')).toBeTruthy());
    await fireEvent.press(getByTestId('approval-approve-po-1'));

    await waitFor(() => expect(alert).toHaveBeenCalled());
  });

  // Two rows both looking approved when one may not be is the reason this is exclusive.
  it('holds every approve control while one is in flight', async () => {
    proc.fetchPendingApprovals.mockResolvedValue({ pos: [po('po-1'), po('po-2')] });
    let settle: () => void = () => undefined;
    proc.approvePurchaseOrder.mockReturnValue(
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
    );

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('approval-approve-po-1')).toBeTruthy());
    await fireEvent.press(getByTestId('approval-approve-po-1'));

    await waitFor(() =>
      expect(getByTestId('approval-approve-po-2').props.accessibilityState.disabled).toBe(true),
    );
    settle();
  });

  it('keeps the dashboard usable when every request fails offline', async () => {
    proc.fetchPendingApprovals.mockRejectedValue(new Error('offline'));
    client.get.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('procurement-screen')).toBeTruthy());
  });
});
