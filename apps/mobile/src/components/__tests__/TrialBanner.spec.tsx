// <TrialBanner /> — the free-trial strip under the top bar (§7.10, ADR-109). Which banner is @cos/ui-logic's
// decision (tested there); here: it reads GET /tenant only when online, renders the right copy, and stays silent
// for a paying tenant or a failed read.

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { I18nProvider } from '../../i18n';
import { TrialBanner } from '../TrialBanner';
import { getMyTenant } from '../../api/tenant';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

jest.mock('../../api/tenant', () => ({ getMyTenant: jest.fn() }));
jest.mock('../../hooks/useNetworkStatus', () => ({ useNetworkStatus: jest.fn() }));

const getMock = getMyTenant as jest.Mock;
const netMock = useNetworkStatus as jest.Mock;

function tenant(over: Record<string, unknown>) {
  return {
    tenant_name: 'Somchai Build',
    tenant_code: 'somchai_build',
    plan_type: 'STARTER',
    subscription_status: 'ACTIVE',
    trial_ends_at: null,
    read_only_until: null,
    ...over,
  };
}

const renderBanner = () =>
  render(
    <I18nProvider>
      <TrialBanner />
    </I18nProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  netMock.mockReturnValue({ isOnline: true });
});

it('counts down a running trial', async () => {
  const ends = new Date(Date.now() + 10 * 86_400_000 - 60_000).toISOString();
  getMock.mockResolvedValue(tenant({ subscription_status: 'TRIAL', trial_ends_at: ends }));
  const r = await renderBanner();
  expect(await r.findByTestId('trial-banner')).toBeTruthy();
  expect(r.getByText(/10/)).toBeTruthy();
});

it('explains read-only once the trial has ended, as an alert', async () => {
  getMock.mockResolvedValue(
    tenant({
      subscription_status: 'EXPIRED',
      trial_ends_at: '2026-10-01T00:00:00Z',
      read_only_until: '2026-10-31T00:00:00Z',
    }),
  );
  const r = await renderBanner();
  const banner = await r.findByTestId('trial-banner');
  expect(banner.props.accessibilityRole).toBe('alert');
});

it('renders nothing for a paying tenant', async () => {
  getMock.mockResolvedValue(tenant({}));
  const r = await renderBanner();
  await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1));
  expect(r.queryByTestId('trial-banner')).toBeNull();
});

it('renders nothing when the read fails', async () => {
  getMock.mockRejectedValue(new Error('offline'));
  const r = await renderBanner();
  await waitFor(() => expect(getMock).toHaveBeenCalledTimes(1));
  expect(r.queryByTestId('trial-banner')).toBeNull();
});

it('does not ask while offline', async () => {
  netMock.mockReturnValue({ isOnline: false });
  const r = await renderBanner();
  expect(getMock).not.toHaveBeenCalled();
  expect(r.queryByTestId('trial-banner')).toBeNull();
});

it('ignores an answer that arrives after it unmounted', async () => {
  let resolve!: (v: unknown) => void;
  getMock.mockReturnValue(new Promise((r) => (resolve = r)));
  const r = await renderBanner();
  await r.unmount();
  resolve(tenant({ subscription_status: 'PENDING_DELETION' }));
  await Promise.resolve();
  expect(getMock).toHaveBeenCalledTimes(1); // answered after unmount: no state update, no warning
});

it('opens the price list and a mail to sales naming the tenant', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  getMock.mockResolvedValue(
    tenant({ subscription_status: 'EXPIRED', read_only_until: '2026-12-31T00:00:00Z' }),
  );
  const r = await renderBanner();
  await r.findByTestId('trial-banner');

  fireEvent.press(r.getByTestId('trial-banner-plans'));
  expect(open).toHaveBeenLastCalledWith('https://construction-os.io/#pricing');

  fireEvent.press(r.getByTestId('trial-banner-contact'));
  const mail = open.mock.calls.at(-1)![0];
  expect(mail.startsWith('mailto:info@construction-os.io?subject=')).toBe(true);
  expect(decodeURIComponent(mail)).toContain('somchai_build');
  open.mockRestore();
});
