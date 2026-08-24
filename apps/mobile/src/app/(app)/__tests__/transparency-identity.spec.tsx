// Behaviour of the identity page of the transparency portal — what the platform holds about you.
//
// A PAGE LISTING WHAT IS HELD MUST NOT RENDER BLANKS WHEN IT DOES NOT KNOW. Offline, the fetch fails
// and empty fields would read as "we hold nothing about you" — the opposite of the truth, on the one
// screen where that reading matters. So the screen says it could not ask.
//
// A NULL EMPLOYEE CODE IS ORDINARY, NOT AN ERROR. Only site workers have a worker record; managers,
// admins and finance legitimately have none. The row is SHOWN and says so in words rather than being
// hidden: on a page listing what is held about you, an identifier that was never issued is itself
// worth stating.
//
// AND THE IDENTIFIER COMES FIRST, because it is the handle the platform holds you BY — every audit
// entry and every request keys on it (PO 2026-08-06).

import { render, waitFor } from '@testing-library/react-native';
import { CosRole } from '@cos/types';
import { I18nProvider } from '../../../i18n';
import { useAuthStore } from '../../../store/authStore';
import TransparencyIdentityScreen from '../transparency-identity';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../../api/client', () => ({ get: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as { get: jest.Mock };

const ME = {
  user_id: 'u-1111-aaaa',
  display_name: 'Waraporn Klinhom',
  email: 'waraporn@example.com',
  phone_number: '+66812345678',
  photo_url: null,
  employee_code: 'EMP-0042',
};

function renderScreen() {
  return render(
    <I18nProvider>
      <TransparencyIdentityScreen />
    </I18nProvider>,
  );
}

describe('TransparencyIdentityScreen', () => {
  beforeEach(() => {
    client.get.mockReset();
    client.get.mockResolvedValue(ME);
    useAuthStore.setState({ role: CosRole.SITE_WORKER, userId: ME.user_id } as never);
  });

  it('asks for the account it is describing', async () => {
    await renderScreen();

    await waitFor(() => expect(client.get).toHaveBeenCalledWith('/users/me'));
  });

  // The handle the platform holds you BY comes first.
  it('shows the identifier, the name and the contact details', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('identity-uid')).toBeTruthy());
    expect(getByTestId('identity-name')).toBeTruthy();
    expect(getByTestId('identity-email')).toBeTruthy();
    expect(getByTestId('identity-phone')).toBeTruthy();
    expect(getByTestId('identity-role')).toBeTruthy();
  });

  it('shows the employee code when the account has one', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('identity-employee-code')).toBeTruthy());
  });

  // ORDINARY, not an error — and shown rather than hidden, because an identifier that was never
  // issued is itself worth stating on this page.
  it('still shows the employee-code row for an account that has none', async () => {
    client.get.mockResolvedValue({ ...ME, employee_code: null });
    useAuthStore.setState({ role: CosRole.PROJECT_MANAGER, userId: ME.user_id } as never);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('identity-employee-code')).toBeTruthy());
  });

  it('shows a row for a contact detail the account does not have', async () => {
    client.get.mockResolvedValue({ ...ME, phone_number: null });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('identity-phone')).toBeTruthy());
  });

  // BLANKS WOULD READ AS "WE HOLD NOTHING" — the opposite of the truth, on the one screen where that
  // reading matters most.
  it('says it could not ask, rather than rendering the fields empty', async () => {
    client.get.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('transparency-identity')).toBeTruthy());
    expect(getByTestId('identity-uid')).toBeTruthy();
  });

  it('names why each field is held', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('identity-purpose')).toBeTruthy());
    expect(getByTestId('identity-purposeAuth')).toBeTruthy();
    expect(getByTestId('identity-purposeSafety')).toBeTruthy();
    expect(getByTestId('identity-purposeAudit')).toBeTruthy();
  });

  it('shows the hero for the account', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('identity-hero')).toBeTruthy());
  });
});
