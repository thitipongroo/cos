// Behaviour of the two reset-password receipts.
//
// One of them puts a live credential on screen. The temporary password is MASKED until revealed and
// SELECTABLE only once it is — an admin reads it out or hands the handset over, and a password
// sitting in plain sight on a site phone is a password on a site phone. The reveal is a toggle, so
// it can be put back.
//
// Neither receipt invents a lifetime. The mockup drew a 60-minute expiry; the platform sets a
// Keycloak temporary credential with no expiry at all, so the copy states what was recorded rather
// than a countdown nobody implements.
//
// The email receipt names the address the SERVER sent to, not the one the admin typed — the reset
// screen passes the server's answer through for exactly that reason.
//
// Both finish with a REPLACE: the reset is done and the form behind it must not be returned to.

import { render, fireEvent } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import ResetPasswordEmailSuccessScreen from '../reset-password-email-success';
import ResetPasswordSuccessScreen from '../reset-password-success';

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: mockReplace }),
}));

const TEMP = 'Xk7-2m9Qz';

function renderTemp() {
  return render(
    <I18nProvider>
      <ResetPasswordSuccessScreen />
    </I18nProvider>,
  );
}

function renderEmail() {
  return render(
    <I18nProvider>
      <ResetPasswordEmailSuccessScreen />
    </I18nProvider>,
  );
}

describe('ResetPasswordSuccessScreen (temporary password)', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
    mockParams = { display_name: 'Waraporn Klinhom', temp_password: TEMP };
  });

  it('names the account that was reset', async () => {
    const { getByTestId } = await renderTemp();

    expect(getByTestId('reset-password-success')).toBeTruthy();
  });

  // A password in plain sight on a site phone is a password on a site phone.
  it('masks the temporary password until it is revealed', async () => {
    const { queryByText } = await renderTemp();

    expect(queryByText(TEMP)).toBeNull();
  });

  it('reveals it on request', async () => {
    const { getByTestId, getByText } = await renderTemp();

    await fireEvent.press(getByTestId('reveal-temp-password'));

    expect(getByText(TEMP)).toBeTruthy();
  });

  // A toggle, so it can be put back after it has been read out.
  it('hides it again on a second press', async () => {
    const { getByTestId, queryByText } = await renderTemp();

    await fireEvent.press(getByTestId('reveal-temp-password'));
    await fireEvent.press(getByTestId('reveal-temp-password'));

    expect(queryByText(TEMP)).toBeNull();
  });

  // Selectable only once revealed — otherwise the mask itself is what gets copied.
  it('makes it selectable only while it is showing', async () => {
    const { getByTestId, getByText } = await renderTemp();

    await fireEvent.press(getByTestId('reveal-temp-password'));

    expect(getByText(TEMP).props.selectable).toBe(true);
  });

  it('shows the mask rather than an empty box when no password came through', async () => {
    mockParams = { display_name: 'Waraporn Klinhom' };

    const { getByTestId } = await renderTemp();

    await fireEvent.press(getByTestId('reveal-temp-password'));

    expect(getByTestId('reset-password-success')).toBeTruthy();
  });

  it('finishes by replacing, so the reset form cannot be returned to', async () => {
    const { getByTestId } = await renderTemp();

    await fireEvent.press(getByTestId('reset-success-done'));

    expect(mockReplace).toHaveBeenCalledWith('/users');
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('ResetPasswordEmailSuccessScreen (reset link)', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
    mockParams = { display_name: 'Waraporn Klinhom', email: 'work@example.com' };
  });

  it('confirms the link was sent', async () => {
    const { getByTestId } = await renderEmail();

    expect(getByTestId('reset-password-email-success')).toBeTruthy();
  });

  // The SERVER's answer, not the address the admin typed — see the reset screen's spec.
  it('names the address it went to', async () => {
    const { getByText } = await renderEmail();

    expect(getByText(/work@example.com/)).toBeTruthy();
  });

  // No credential is shown here: there is none to show, and a masked box would imply one.
  it('shows no password at all', async () => {
    const { queryByTestId } = await renderEmail();

    expect(queryByTestId('reveal-temp-password')).toBeNull();
  });

  it('still reads as a confirmation when the address did not come through', async () => {
    mockParams = { display_name: 'Waraporn Klinhom' };

    const { getByTestId } = await renderEmail();

    expect(getByTestId('reset-password-email-success')).toBeTruthy();
  });

  it('finishes by replacing too', async () => {
    const { getByTestId } = await renderEmail();

    await fireEvent.press(getByTestId('reset-link-done'));

    expect(mockReplace).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
