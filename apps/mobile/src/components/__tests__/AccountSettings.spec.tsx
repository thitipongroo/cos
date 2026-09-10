// Behaviour of the account settings card.
//
// Three rows here are deliberately NOT what they look like, and each is a decision that a test can
// stop someone "fixing":
//
// The biometric switch is DISABLED, not hidden, when the device has nothing enrolled — hiding it
// leaves a worker wondering where it went, and the OS, not this row, is where a fingerprint gets
// enrolled.
//
// "Change Secure PIN" reports being unavailable rather than opening anything. This product has no
// PIN: no column, no set/verify endpoint, no recovery path. A credential dialog with nothing behind
// it is a security feature in name only.
//
// The language row TOGGLES rather than pushing a picker. With exactly two locales, a picker screen
// would be a screen for choosing between two items.
//
// And the version is the REAL build version, not the mockup's "2.4.0-stable" — it is the one thing
// on this card a user might quote in a support request, so it must never be decorative.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { I18nProvider } from '../../i18n';
import { useBiometricStore } from '../../store/biometricStore';
import { useThemeStore } from '../../store/themeStore';
import { CosRole } from '@cos/types';
import { useAuthStore } from '../../store/authStore';
import { useLocaleStore } from '../../store/localeStore';
import { AccountSettings } from '../AccountSettings';
import { VIEWER_PERMISSION_TILES } from '../../lib/mockupFigures';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

// `<NotificationSettings />` renders inside this card and fetches its preferences on mount. LEAVING
// THAT REQUEST UNMOCKED IS NOT HARMLESS: it reaches `api/client`, the 401 interceptor calls
// `useAuthStore.getState().logout()`, and the store this spec sets in `beforeEach` is emptied
// mid-test. It raced the render — the profile-head assertions failed roughly one run in four, with
// the name and the id both back at their fallbacks — which is exactly what a flake that survives a
// green run looks like. The component has its own spec; here it is mocked to silence.
jest.mock('../../api/notifications', () => ({
  getNotificationPreferences: jest.fn().mockResolvedValue([]),
  updateNotificationPreferences: jest.fn().mockResolvedValue(undefined),
}));

// `GET /users/me` feeds the profile head and the MFA row's state — the same call the drawer makes
// for the same block. Mocked rather than left to reject, so each answer can be asserted.
jest.mock('../../api/users', () => ({ getMe: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const users = require('../../api/users') as { getMe: jest.Mock };

const ME = {
  user_id: 'u-1111-aaaa',
  email: 'v@example.com',
  display_name: 'Vorawee S.',
  photo_url: null,
  role: 'CRM_SALES_MANAGER',
  mfa_enabled: true,
  employee_code: null,
  position: 'CRM Manager',
};

function renderCard() {
  return render(
    <I18nProvider>
      <AccountSettings />
    </I18nProvider>,
  );
}

describe('AccountSettings', () => {
  let setEnabled: jest.Mock;
  let setMode: jest.Mock;
  let alert: jest.SpyInstance;

  beforeEach(() => {
    setEnabled = jest.fn().mockResolvedValue(undefined);
    setMode = jest.fn().mockResolvedValue(undefined);
    useBiometricStore.setState({ available: true, enabled: false, setEnabled } as never);
    useThemeStore.setState({ mode: 'dark', setMode } as never);
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    users.getMe.mockReset();
    users.getMe.mockResolvedValue(ME);
    useAuthStore.setState({ displayName: 'Vorawee S.', userId: 'u-1111-aaaa' } as never);
    // The language row toggles the locale and persists it, so a test running after it would
    // otherwise render in Thai and every assertion on English copy would be an accident.
    useLocaleStore.setState({ locale: 'en' } as never);
  });

  afterEach(() => alert.mockRestore());

  it('renders the security and preference rows', async () => {
    const { getByTestId } = await renderCard();

    expect(getByTestId('profile-mfa-row')).toBeTruthy();
    expect(getByTestId('biometric-row')).toBeTruthy();
    expect(getByTestId('change-pin-row')).toBeTruthy();
    expect(getByTestId('locale-row')).toBeTruthy();
    expect(getByTestId('theme-row')).toBeTruthy();
  });

  it('turns the biometric lock on', async () => {
    const { getByTestId } = await renderCard();

    await fireEvent(getByTestId('biometric-row-switch'), 'valueChange', true);

    await waitFor(() => expect(setEnabled).toHaveBeenCalledWith(true));
  });

  it('turns it off again', async () => {
    useBiometricStore.setState({ available: true, enabled: true, setEnabled } as never);

    const { getByTestId } = await renderCard();

    await fireEvent(getByTestId('biometric-row-switch'), 'valueChange', false);

    await waitFor(() => expect(setEnabled).toHaveBeenCalledWith(false));
  });

  // DISABLED, not hidden — see the note at the top of this file.
  it('shows the biometric row disabled when the device has nothing enrolled', async () => {
    useBiometricStore.setState({ available: false, enabled: false, setEnabled } as never);

    const { getByTestId } = await renderCard();

    expect(getByTestId('biometric-row-switch').props.disabled).toBe(true);
  });

  // `setEnabled` awaits SecureStore and the biometric prompt and guards neither, so it can reject.
  // The switch reads its position from the store, so a failed enable already shows as the toggle
  // staying put; what must not happen is the rejection escaping as an unhandled one, and what must
  // not happen next is the row being left permanently busy.
  it('recovers from a failed toggle rather than staying stuck', async () => {
    setEnabled.mockRejectedValue(new Error('secure store unavailable'));

    const { getByTestId } = await renderCard();

    await fireEvent(getByTestId('biometric-row-switch'), 'valueChange', true);

    await waitFor(() => expect(setEnabled).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getByTestId('biometric-row-switch').props.disabled).toBe(false));
  });

  // No PIN exists in this product. The row is drawn because the mockup draws it, and it says so.
  it('reports the secure PIN as unavailable rather than opening a dialog', async () => {
    const { getByTestId } = await renderCard();

    await fireEvent.press(getByTestId('change-pin-row'));

    expect(alert).toHaveBeenCalled();
  });

  // Two locales: a picker screen would be a screen for choosing between two items.
  it('swaps the language in place', async () => {
    const { getByTestId } = await renderCard();

    await fireEvent.press(getByTestId('locale-row'));

    // The row now names the other language, which is what it will switch to next.
    await waitFor(() => expect(getByTestId('locale-row')).toBeTruthy());
  });

  it('switches the theme', async () => {
    const { getByTestId } = await renderCard();

    await fireEvent(getByTestId('theme-row-switch'), 'valueChange', false);

    expect(setMode).toHaveBeenCalledWith('light');
  });

  it('shows the theme switch on for a dark session', async () => {
    const { getByTestId } = await renderCard();

    expect(getByTestId('theme-row-switch').props.value).toBe(true);
  });

  // The one thing here a user might quote in a support request.
  it('shows a build version', async () => {
    const { getByTestId } = await renderCard();

    expect(getByTestId('profile-version')).toBeTruthy();
  });
});

// -- THE THREE-GROUP LAYOUT AND ITS PROFILE HEAD (2026-09-10) -----------------------------------
//
// The rows did not change; where they sit did, and a profile head was added above them. What these
// tests hold is the part of that which is a CLAIM rather than a layout: the head's fields are the
// standard block, the MFA row's state is read rather than drawn, the sync line is the app's own
// precedence rather than a timestamp nothing records, and the cache figure is measured.

describe('AccountSettings - the profile head', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    useBiometricStore.setState({
      available: true,
      enabled: false,
      setEnabled: jest.fn(),
    } as never);
    useThemeStore.setState({ mode: 'dark', setMode: jest.fn() } as never);
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    users.getMe.mockReset();
    users.getMe.mockResolvedValue(ME);
    useAuthStore.setState({ displayName: 'Vorawee S.', userId: 'u-1111-aaaa' } as never);
    // The language row toggles the locale and persists it, so a test running after it would
    // otherwise render in Thai and every assertion on English copy would be an accident.
    useLocaleStore.setState({ locale: 'en' } as never);
  });

  afterEach(() => alert.mockRestore());

  // AVATAR - NAME - POSITION - ID - STATUS, the standard block (spec 32.7). The drawing's photo
  // avatar and its hardcoded "CRM Manager" line are not what render: the position is real.
  it('draws the standard profile block, in its order', async () => {
    const { getByTestId, getByText } = await renderCard();

    await waitFor(() => expect(getByTestId('settings-job-title')).toHaveTextContent(/CRM Manager/));
    expect(getByText('Vorawee S.')).toBeTruthy();
    expect(getByTestId('settings-user-id')).toBeTruthy();
    expect(getByTestId('settings-sync-row')).toBeTruthy();
  });

  // A null position draws NOTHING - no placeholder, no role. Null is the ordinary case: no route
  // sets one.
  it('draws no position line when the account has no position', async () => {
    users.getMe.mockResolvedValue({ ...ME, position: null });

    const { getByTestId, queryByTestId } = await renderCard();

    await waitFor(() => expect(getByTestId('settings-user-id')).toBeTruthy());
    expect(queryByTestId('settings-job-title')).toBeNull();
  });

  it('falls back to a short id, and says nothing about a factor it could not read', async () => {
    users.getMe.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderCard();

    await waitFor(() => expect(getByTestId('settings-user-id')).toHaveTextContent(/AAAA/));
    expect(getByTestId('profile-mfa-row')).not.toHaveTextContent(/MFA active|Not enrolled/);
  });

  // REAL: platform.users.mfa_enabled, the same column the drawer's status line reads.
  it('says the second factor is enrolled when it is', async () => {
    const { getByTestId } = await renderCard();

    await waitFor(() => expect(getByTestId('profile-mfa-row')).toHaveTextContent(/MFA active/));
  });

  it('says it is not enrolled when it is not', async () => {
    users.getMe.mockResolvedValue({ ...ME, mfa_enabled: false });

    const { getByTestId } = await renderCard();

    await waitFor(() => expect(getByTestId('profile-mfa-row')).toHaveTextContent(/Not enrolled/));
  });

  // The drawing prints "Last sync: 2 min ago". Nothing here records when the last flush finished,
  // so the head says the CURRENT state instead, through the same precedence every other sync
  // indicator reads.
  it('reports the current sync state rather than a time nothing records', async () => {
    const { getByTestId } = await renderCard();

    await waitFor(() => expect(getByTestId('settings-sync-row')).toBeTruthy());
    expect(getByTestId('settings-sync-row')).not.toHaveTextContent(/ago/i);
  });
});

describe('AccountSettings - the system group', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    useBiometricStore.setState({
      available: true,
      enabled: false,
      setEnabled: jest.fn(),
    } as never);
    useThemeStore.setState({ mode: 'dark', setMode: jest.fn() } as never);
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    users.getMe.mockReset();
    users.getMe.mockResolvedValue(ME);
    useAuthStore.setState({ displayName: 'Vorawee S.', userId: 'u-1111-aaaa' } as never);
    // The language row toggles the locale and persists it, so a test running after it would
    // otherwise render in Thai and every assertion on English copy would be an accident.
    useLocaleStore.setState({ locale: 'en' } as never);
  });

  afterEach(() => alert.mockRestore());

  // MEASURED, not drawn: PRAGMA page_count x page_size, shown against the 17.7 ceiling it is
  // measured for. The drawing's "2.4 GB" is a figure no device here reported.
  it('shows the offline database size against its ceiling', async () => {
    const { getByTestId } = await renderCard();

    await waitFor(() => expect(getByTestId('offline-data-row')).toBeTruthy());
    expect(getByTestId('offline-data-row')).toHaveTextContent(/of 500\.0 MB/);
    expect(getByTestId('offline-data-row')).not.toHaveTextContent(/2\.4 GB/);
  });

  // It REPORTS and does not manage - nothing in this app prunes that cache on request, so the row
  // is not a button and must never become one by accident.
  it('offers no action on the offline row, because there is none to offer', async () => {
    const { getByTestId } = await renderCard();

    await waitFor(() => expect(getByTestId('offline-data-row')).toBeTruthy());
    expect(getByTestId('offline-data-row').props.accessibilityRole).toBeUndefined();
  });

  // Nothing was dropped in the regrouping (ADR-085: a drawing does not remove reviewed working
  // capability). These three have no place in the CRM drawing and are all still here.
  it('keeps every row the drawing does not draw', async () => {
    const { getByTestId } = await renderCard();

    await waitFor(() => expect(getByTestId('profile-version')).toBeTruthy());
    expect(getByTestId('change-pin-row')).toBeTruthy();
    expect(getByTestId('theme-row')).toBeTruthy();
  });

  // ── SYSTEM PERMISSIONS — the one role-conditional block on this screen (PO 2026-09-10) ────────
  //
  // One screen serves all twelve roles, so the risk a test has to hold is in BOTH directions: the
  // block must appear for VIEWER and must not appear for anyone else. Rendering it for every role
  // would tell eleven of them their access is read-only, which is false for all eleven.

  it('draws no System Permissions block for a role that is not the Viewer', async () => {
    useAuthStore.setState({ role: CosRole.CRM_SALES_MANAGER } as never);

    const { queryByTestId, getByTestId } = await renderCard();

    await waitFor(() => expect(getByTestId('profile-mfa-row')).toBeTruthy());
    expect(queryByTestId('permissions-section')).toBeNull();
  });

  it('draws the three READ ONLY permission tiles for the Viewer', async () => {
    useAuthStore.setState({ role: CosRole.VIEWER } as never);

    const { getByTestId } = await renderCard();

    await waitFor(() => expect(getByTestId('permissions-section')).toBeTruthy());
    for (const tile of VIEWER_PERMISSION_TILES.value) {
      expect(getByTestId(`permission-tile-${tile.key}`)).toHaveTextContent(/read only/i);
    }
  });

  it('still shows the Viewer every row the other eleven roles get', async () => {
    useAuthStore.setState({ role: CosRole.VIEWER } as never);

    const { getByTestId } = await renderCard();

    // E2 = A: the block is ADDED for this role, and nothing is taken away for it. A per-role
    // layout was the option the product owner declined.
    await waitFor(() => expect(getByTestId('permissions-section')).toBeTruthy());
    expect(getByTestId('profile-mfa-row')).toBeTruthy();
    expect(getByTestId('change-pin-row')).toBeTruthy();
    expect(getByTestId('theme-row')).toBeTruthy();
    expect(getByTestId('profile-version')).toBeTruthy();
  });
});
