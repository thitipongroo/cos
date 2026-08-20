// Behaviour of the PDPA data-subject contact form.
//
// This route is UNAUTHENTICATED — anyone can reach it, which is the point: a data subject who is not
// a user still has rights to exercise. Three of its rules follow from that.
//
// NO SERVER TEXT IS SURFACED on failure. An upstream message could carry detail about the platform
// that a stranger has no business reading, so the screen says what to do in its own words.
//
// NO EMAIL REGEX. The server validates the address with class-validator; a second, different rule
// here would reject addresses the server accepts, and the person turned away has no other route in.
// The client checks only that the required fields are not blank — trimmed, because a space is not an
// answer.
//
// AND THE RECEIPT REPLACES THE FORM. Back from the receipt should reach the policy, not a form still
// holding what was just sent.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider } from '../../../i18n';
import PrivacyContactScreen from '../privacy-contact';

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: mockReplace }),
}));

jest.mock('../../../api/privacyInquiry', () => ({
  ...jest.requireActual('../../../api/privacyInquiry'),
  submitPrivacyInquiry: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../../../api/privacyInquiry') as { submitPrivacyInquiry: jest.Mock };

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const RECEIPT = { reference: 'PI-2026-0001', received_at: '2026-08-20T09:00:00Z' };

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <I18nProvider>
        <PrivacyContactScreen />
      </I18nProvider>
    </SafeAreaProvider>,
  );
}

/** Fill only what the form requires. */
async function fillRequired(getByTestId: (id: string) => never) {
  await fireEvent.changeText(getByTestId('privacy-contact-name'), 'Waraporn Klinhom');
  await fireEvent.changeText(getByTestId('privacy-contact-email'), 'waraporn@example.com');
  await fireEvent.changeText(getByTestId('privacy-contact-subject'), 'Access request');
  await fireEvent.changeText(getByTestId('privacy-contact-message'), 'Please send me my data.');
}

describe('PrivacyContactScreen', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
    api.submitPrivacyInquiry.mockReset();
    api.submitPrivacyInquiry.mockResolvedValue(RECEIPT);
  });

  it('opens with submit off', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('privacy-contact-submit').props.accessibilityState.disabled).toBe(true);
  });

  it('turns submit on once every required field is answered', async () => {
    const { getByTestId } = await renderScreen();

    await fillRequired(getByTestId as never);

    await waitFor(() =>
      expect(getByTestId('privacy-contact-submit').props.accessibilityState.disabled).toBe(false),
    );
  });

  // A space is not an answer.
  it('does not count whitespace as an answer', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('privacy-contact-name'), '   ');
    await fireEvent.changeText(getByTestId('privacy-contact-email'), 'waraporn@example.com');
    await fireEvent.changeText(getByTestId('privacy-contact-subject'), 'Access request');
    await fireEvent.changeText(getByTestId('privacy-contact-message'), 'Please send me my data.');

    expect(getByTestId('privacy-contact-submit').props.accessibilityState.disabled).toBe(true);
  });

  // NO EMAIL REGEX — the server decides, and a stricter client rule turns people away with no other
  // route in. This asserts the absence of that rule.
  it('does not apply an address rule of its own', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('privacy-contact-name'), 'Waraporn Klinhom');
    await fireEvent.changeText(getByTestId('privacy-contact-email'), 'w@localhost');
    await fireEvent.changeText(getByTestId('privacy-contact-subject'), 'Access request');
    await fireEvent.changeText(getByTestId('privacy-contact-message'), 'Please send me my data.');

    await waitFor(() =>
      expect(getByTestId('privacy-contact-submit').props.accessibilityState.disabled).toBe(false),
    );
  });

  it('sends the trimmed answers', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('privacy-contact-name'), '  Waraporn Klinhom  ');
    await fireEvent.changeText(getByTestId('privacy-contact-email'), ' waraporn@example.com ');
    await fireEvent.changeText(getByTestId('privacy-contact-subject'), ' Access request ');
    await fireEvent.changeText(getByTestId('privacy-contact-message'), ' Please send my data. ');
    await fireEvent.press(getByTestId('privacy-contact-submit'));

    await waitFor(() => expect(api.submitPrivacyInquiry).toHaveBeenCalledTimes(1));
    expect(api.submitPrivacyInquiry.mock.calls[0][0]).toEqual({
      full_name: 'Waraporn Klinhom',
      email: 'waraporn@example.com',
      category: 'GENERAL',
      subject: 'Access request',
      message: 'Please send my data.',
    });
  });

  // An empty phone is OMITTED, not sent as '' — a blank number is a different claim from none.
  it('leaves the phone out when none was given', async () => {
    const { getByTestId } = await renderScreen();

    await fillRequired(getByTestId as never);
    await fireEvent.press(getByTestId('privacy-contact-submit'));

    await waitFor(() => expect(api.submitPrivacyInquiry).toHaveBeenCalledTimes(1));
    expect('phone' in api.submitPrivacyInquiry.mock.calls[0][0]).toBe(false);
  });

  it('sends the phone when one was given', async () => {
    const { getByTestId } = await renderScreen();

    await fillRequired(getByTestId as never);
    await fireEvent.changeText(getByTestId('privacy-contact-phone'), '0812345678');
    await fireEvent.press(getByTestId('privacy-contact-submit'));

    await waitFor(() => expect(api.submitPrivacyInquiry).toHaveBeenCalledTimes(1));
    expect(api.submitPrivacyInquiry.mock.calls[0][0].phone).toBe('0812345678');
  });

  it('carries the category the data subject chose', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('privacy-contact-category-DATA_DELETION'));
    await fillRequired(getByTestId as never);
    await fireEvent.press(getByTestId('privacy-contact-submit'));

    await waitFor(() => expect(api.submitPrivacyInquiry).toHaveBeenCalledTimes(1));
    expect(api.submitPrivacyInquiry.mock.calls[0][0].category).toBe('DATA_DELETION');
  });

  // REPLACE, not push: back from the receipt should reach the policy, not a form still holding what
  // was just sent.
  it('replaces the form with the receipt, carrying the reference', async () => {
    const { getByTestId } = await renderScreen();

    await fillRequired(getByTestId as never);
    await fireEvent.press(getByTestId('privacy-contact-submit'));

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(auth)/privacy-contact-sent',
        params: { reference: 'PI-2026-0001', receivedAt: '2026-08-20T09:00:00Z' },
      }),
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  // NO SERVER TEXT. An upstream message could carry platform detail a stranger has no business
  // reading, so the screen says what to do in its own words.
  it('reports a failure without quoting the server', async () => {
    api.submitPrivacyInquiry.mockRejectedValue(new Error('upstream: pg_hba.conf rejects host'));

    const { getByTestId } = await renderScreen();

    await fillRequired(getByTestId as never);
    await fireEvent.press(getByTestId('privacy-contact-submit'));

    await waitFor(() => expect(getByTestId('privacy-contact-error')).toBeTruthy());
    expect(String(getByTestId('privacy-contact-error').props.children)).not.toContain('pg_hba');
  });

  it('keeps the form and lets it be sent again after a failure', async () => {
    api.submitPrivacyInquiry.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await fillRequired(getByTestId as never);
    await fireEvent.press(getByTestId('privacy-contact-submit'));

    await waitFor(() => expect(getByTestId('privacy-contact-error')).toBeTruthy());
    expect(getByTestId('privacy-contact-subject').props.value).toBe('Access request');
    expect(getByTestId('privacy-contact-submit').props.accessibilityState.disabled).toBe(false);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // The caps mirror the server DTO so the field stops before the server does — a 400 on a form
  // someone already filled in is a worse experience than a maxLength.
  it('caps the fields at the lengths the server accepts', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('privacy-contact-name').props.maxLength).toBe(255);
    expect(getByTestId('privacy-contact-email').props.maxLength).toBe(255);
    expect(getByTestId('privacy-contact-phone').props.maxLength).toBe(50);
    expect(getByTestId('privacy-contact-subject').props.maxLength).toBe(255);
    expect(getByTestId('privacy-contact-message').props.maxLength).toBe(5000);
  });
});
