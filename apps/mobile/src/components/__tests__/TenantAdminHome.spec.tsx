// Behaviour of the Tenant Admin's Home — the role's landing "command view".
//
// EVERY FIGURE ON THIS SCREEN IS REAL OR IT IS AN EM DASH. The mockup prints "OPTIMAL", "78 %",
// "#SYNC-4920" and "12 new users"; none of those are derivable from anything this platform serves,
// and this is the screen a tenant administrator judges the whole system by. A plausible number here
// is worse than no number: it is acted on. So the tests below are mostly about what appears when a
// figure is MISSING — "—", never a zero, because a zero is a claim.
//
// THE APPROVAL COUNTS ARE ASKED OF THE SERVER, NOT COUNTED FROM A PAGE. Both tiles used to filter
// page one and report its length. Both endpoints paginate at 20, the seeded tenant holds forty-odd
// POs and thirty-odd payments, and the ORDER BY that decides page one has no tiebreaker (the seed
// inserts them in one transaction, so every `created_at` is identical) — so "awaiting approval"
// could read 0 while the database held two, and read differently between runs. The request now asks
// for `limit: 1` and reads `total`: nothing here reads rows, only the count.
//
// AND 0% IS THE TRUTH TODAY. The AI usage tile shows 0 until the gateway records real consumption —
// which is a real figure and must not be confused with the missing case.

import { render, fireEvent, waitFor, within } from '@testing-library/react-native';
import { I18nProvider } from '../../i18n';
import TenantAdminHome from '../TenantAdminHome';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../api/client', () => ({ get: jest.fn(), post: jest.fn(), mutate: jest.fn() }));
jest.mock('../../api/health', () => ({ checkBackendHealth: jest.fn() }));
jest.mock('../../api/ai', () => ({ getAiUsage: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../api/client') as { get: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const health = require('../../api/health') as { checkBackendHealth: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ai = require('../../api/ai') as { getAiUsage: jest.Mock };

function usage(over: Record<string, unknown> = {}) {
  return {
    tokensUsed: 0,
    quota: 1_000_000,
    percentUsed: 0,
    periodMonth: '2026-08',
    alertLevel: 'none',
    ...over,
  };
}

/** Answer the two approval queues by path, since both go through the same client. */
function counts(payments: unknown, pos: unknown) {
  client.get.mockImplementation((path: string) =>
    path === '/finance/payments' ? Promise.resolve(payments) : Promise.resolve(pos),
  );
}

function renderHome() {
  return render(
    <I18nProvider>
      <TenantAdminHome />
    </I18nProvider>,
  );
}

describe('TenantAdminHome', () => {
  beforeEach(() => {
    mockPush.mockReset();
    client.get.mockReset();
    health.checkBackendHealth.mockReset().mockResolvedValue(true);
    ai.getAiUsage.mockReset().mockResolvedValue(usage());
    counts({ items: [], total: 0 }, { items: [], total: 0 });
  });

  it('renders the four sections once the figures land', async () => {
    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('admin-ai-tokens')).toBeTruthy());
    expect(getByTestId('admin-system-status')).toBeTruthy();
    expect(getByTestId('admin-approval-payments')).toBeTruthy();
    expect(getByTestId('admin-ai-insights')).toBeTruthy();
  });

  // ── THE COUNTS ───────────────────────────────────────────────────────────────────────────────

  // The server's own `total`, and `limit: 1` because nothing here reads the rows — shipping 20 of
  // them over site 3G to count them would be paying for data to throw away.
  it('asks each queue for its total, not for its rows', async () => {
    counts({ items: [{}], total: 7 }, { items: [{}], total: 2 });

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('admin-approval-payments')).toBeTruthy());
    expect(client.get).toHaveBeenCalledWith('/finance/payments', {
      status: 'PENDING',
      limit: '1',
    });
    expect(client.get).toHaveBeenCalledWith('/procurement/purchase-orders', {
      status: 'PENDING_APPROVAL',
      limit: '1',
    });
  });

  it('reports each queue by the tenant total', async () => {
    counts({ items: [{}], total: 7 }, { items: [{}], total: 2 });

    const { getByTestId, getByText } = await renderHome();

    await waitFor(() => expect(getByTestId('admin-approval-payments')).toBeTruthy());
    expect(getByText('7')).toBeTruthy();
    expect(getByText('2')).toBeTruthy();
  });

  // A server that answers a bare list gives no total — then the length is all there is, and it is at
  // least a FILTERED one, because the request carried the status.
  it('falls back to the length when the server sends no total', async () => {
    counts([{}, {}, {}], { items: [], total: 0 });

    const { getByTestId, getByText } = await renderHome();

    await waitFor(() => expect(getByTestId('admin-approval-payments')).toBeTruthy());
    expect(getByText('3')).toBeTruthy();
  });

  // Offline: an em dash, NOT a zero. "No payments are awaiting approval" is a claim, and this screen
  // is where a tenant administrator decides there is nothing to do today.
  it('shows a dash rather than a zero when a queue cannot be reached', async () => {
    client.get.mockRejectedValue(new Error('offline'));

    const { getByTestId, getAllByText } = await renderHome();

    await waitFor(() => expect(getByTestId('admin-approval-payments')).toBeTruthy());
    expect(getAllByText('—').length).toBeGreaterThan(0);
  });

  // And zero, when it IS zero, is shown as zero.
  it('shows an empty queue as zero', async () => {
    counts({ items: [], total: 0 }, { items: [], total: 0 });

    const { getByTestId, getAllByText } = await renderHome();

    await waitFor(() => expect(getByTestId('admin-approval-payments')).toBeTruthy());
    expect(getAllByText('0').length).toBeGreaterThan(0);
  });

  // Each row opens the queue it counts. The two rows carry the same "Review" wording, so they are
  // told apart by position — which is also how a reader tells them apart.
  it('opens the payments queue from the payments row', async () => {
    const { getByTestId, getAllByText } = await renderHome();
    await waitFor(() => expect(getByTestId('admin-approval-payments')).toBeTruthy());

    await fireEvent.press(getAllByText('Review')[0]!);

    expect(mockPush).toHaveBeenCalledWith('/payments');
  });

  it('opens the purchase orders from the PO row', async () => {
    const { getByTestId, getAllByText } = await renderHome();
    await waitFor(() => expect(getByTestId('admin-approval-pos')).toBeTruthy());

    await fireEvent.press(getAllByText('Review')[1]!);

    expect(mockPush).toHaveBeenCalledWith('/orders');
  });

  // ── THE SYSTEM STATUS ────────────────────────────────────────────────────────────────────────
  //
  // The mockup's "OPTIMAL" tier is not derivable from a liveness ping. Operational / Unavailable is
  // the truth this platform has, and a third word invented between them would be a health claim the
  // health endpoint never made.

  it('says the system is operational when the liveness ping answers', async () => {
    health.checkBackendHealth.mockResolvedValue(true);

    const { getByTestId, getByText } = await renderHome();

    await waitFor(() => expect(getByTestId('admin-system-status')).toBeTruthy());
    expect(getByText('Operational')).toBeTruthy();
  });

  it('says it is unavailable when the ping says so', async () => {
    health.checkBackendHealth.mockResolvedValue(false);

    const { getByTestId, getByText } = await renderHome();

    await waitFor(() => expect(getByTestId('admin-system-status')).toBeTruthy());
    expect(getByText('Unavailable')).toBeTruthy();
  });

  // A ping that THREW is not an unknown state — it is the clearest evidence of unavailability there
  // is, and leaving it as "checking" forever would report an outage as a slow screen.
  it('treats a ping that failed as unavailable, not as still checking', async () => {
    health.checkBackendHealth.mockRejectedValue(new Error('ECONNREFUSED'));

    const { getByTestId, getByText } = await renderHome();

    await waitFor(() => expect(getByTestId('admin-system-status')).toBeTruthy());
    expect(getByText('Unavailable')).toBeTruthy();
  });

  // ── THE AI USAGE ─────────────────────────────────────────────────────────────────────────────

  // 0% is a REAL figure today — the gateway records no consumption yet — and it must not be shown
  // the same way as a figure that failed to arrive.
  it('shows a real zero as zero', async () => {
    ai.getAiUsage.mockResolvedValue(usage({ percentUsed: 0 }));

    const { getByTestId, getAllByText } = await renderHome();

    await waitFor(() => expect(getByTestId('admin-ai-tokens')).toBeTruthy());
    expect(getAllByText('0').length).toBeGreaterThan(0);
  });

  it('shows a dash when metering is not reporting at all', async () => {
    ai.getAiUsage.mockRejectedValue(new Error('offline'));

    const { getByTestId, getAllByText } = await renderHome();

    await waitFor(() => expect(getByTestId('admin-ai-tokens')).toBeTruthy());
    expect(getAllByText('—').length).toBeGreaterThan(0);
  });

  // An ENTERPRISE tenant is uncapped, so there is no percentage to show — a bar at 0% would read as
  // "no usage" when the truth is "no ceiling".
  it('shows a dash for an uncapped tenant, which has no percentage to show', async () => {
    ai.getAiUsage.mockResolvedValue(usage({ quota: null, percentUsed: null, tokensUsed: 900_000 }));

    const { getByTestId, getAllByText } = await renderHome();

    await waitFor(() => expect(getByTestId('admin-ai-tokens')).toBeTruthy());
    expect(getAllByText('—').length).toBeGreaterThan(0);
  });

  // ── THE INSIGHT LINE ─────────────────────────────────────────────────────────────────────────
  //
  // Localised from the SERVER's band and percent (§31.3). The band is the server's judgement; this
  // screen only chooses the wording, so no threshold is duplicated here to drift out of step.

  it('says all clear while the tenant is inside its budget', async () => {
    ai.getAiUsage.mockResolvedValue(usage({ alertLevel: 'none', percentUsed: 12 }));

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('admin-ai-insights')).toBeTruthy());
  });

  // SCOPED TO THE INSIGHT CARD: the same percentage is printed above it in the usage tile, so an
  // unscoped search finds both and proves neither.
  it.each([
    ['warning', 84, /84% of your monthly quota/],
    ['critical', 103, /quota reached \(103%\)/],
  ])('changes what it says at the %s band', async (alertLevel, percentUsed, wording) => {
    ai.getAiUsage.mockResolvedValue(usage({ alertLevel, percentUsed }));

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('admin-ai-insights')).toBeTruthy());
    expect(within(getByTestId('admin-ai-insights')).getByText(wording)).toBeTruthy();
  });

  // The band is the SERVER's judgement (§31.3); this screen only chooses the wording, so no
  // threshold is duplicated here to drift out of step with the one that decides it.
  it('reports the critical band even when the percentage is missing', async () => {
    ai.getAiUsage.mockResolvedValue(usage({ alertLevel: 'critical', percentUsed: null }));

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('admin-ai-insights')).toBeTruthy());
    expect(within(getByTestId('admin-ai-insights')).getByText(/paused/)).toBeTruthy();
  });

  // ── THE QUICK-ADD MENU ───────────────────────────────────────────────────────────────────────

  it('opens the quick-add menu from the FAB, closed until then', async () => {
    const { getByTestId, queryByTestId } = await renderHome();
    await waitFor(() => expect(getByTestId('quick-add-fab')).toBeTruthy());

    expect(queryByTestId('quick-add-menu')).toBeNull();

    await fireEvent.press(getByTestId('quick-add-fab'));

    expect(getByTestId('quick-add-menu')).toBeTruthy();
  });

  // ── RULE 40 ──────────────────────────────────────────────────────────────────────────────────

  // Four independent fetches, and the loader reports how many have LANDED rather than sitting at one
  // value until they all do — an honest progress figure, not an animation.
  it('holds the dashboard behind the loading state until the figures settle', async () => {
    client.get.mockReturnValue(new Promise(() => undefined));
    health.checkBackendHealth.mockReturnValue(new Promise(() => undefined));
    ai.getAiUsage.mockReturnValue(new Promise(() => undefined));

    const { getByTestId, queryByTestId } = await renderHome();

    expect(getByTestId('tenant-admin-home')).toBeTruthy();
    expect(queryByTestId('admin-ai-tokens')).toBeNull();
  });

  // Each catch resolves, so the screen settles offline rather than holding a skeleton forever.
  it('settles even when every figure fails', async () => {
    client.get.mockRejectedValue(new Error('offline'));
    health.checkBackendHealth.mockRejectedValue(new Error('offline'));
    ai.getAiUsage.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderHome();

    await waitFor(() => expect(getByTestId('admin-ai-tokens')).toBeTruthy());
  });
});
