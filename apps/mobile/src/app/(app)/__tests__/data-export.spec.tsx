// Behaviour of the PDPA §30 data-export request.
//
// This screen serves a statutory right, and two of its rules exist because of what a wrong sentence
// here would mean in front of a regulator.
//
// A FEATURE FLAG THAT IS OFF IS NOT A FAILURE. "Your request failed" when the truth is "not
// switched on yet" is the kind of answer a data subject can escalate; the screen says which it is.
//
// A WRONG CODE AND AN EXPIRED CODE GET THE SAME MESSAGE, on purpose. Telling them apart tells an
// attacker which of the two they got.
//
// And the step-up is verified and spent in ONE gesture: the action token lives five minutes and is
// consumed on first use, so handing it back to the user between two taps only gives it time to
// expire.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import DataExportScreen from '../data-export';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../../api/dataExport', () => ({
  ...jest.requireActual('../../../api/dataExport'),
  requestExportStepUp: jest.fn(),
  verifyExportStepUp: jest.fn(),
  requestDataExport: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../../../api/dataExport') as {
  requestExportStepUp: jest.Mock;
  verifyExportStepUp: jest.Mock;
  requestDataExport: jest.Mock;
};

const CHALLENGE = { channel: 'EMAIL', destination: 'w***@example.com', expiresInSeconds: 300 };
const SUBMITTED = {
  exportId: 'ex-1',
  status: 'PENDING',
  categories: ['PROFILE'],
  format: 'JSON',
  requestedAt: '2026-08-20T09:00:00Z',
  expiresAt: '2026-08-27T09:00:00Z',
  downloadable: false,
  failureReason: null,
};

// What `isFeatureDisabled` actually reads: a 503 whose QM-10 error envelope carries COS-FLAG-001.
// A flat `{ code }` is the shape that made that check silently unreachable in production once
// already — see the note on the function.
const FLAG_OFF = { response: { status: 503, data: { error: { code: 'COS-FLAG-001' } } } };

function renderScreen() {
  return render(
    <I18nProvider>
      <DataExportScreen />
    </I18nProvider>,
  );
}

/** Get past the choose stage to the code entry. */
async function toVerify(getByTestId: (id: string) => never) {
  await fireEvent.press(getByTestId('export-submit'));
  await waitFor(() => expect(getByTestId('export-code')).toBeTruthy());
}

describe('DataExportScreen', () => {
  beforeEach(() => {
    api.requestExportStepUp.mockReset();
    api.verifyExportStepUp.mockReset();
    api.requestDataExport.mockReset();
    api.requestExportStepUp.mockResolvedValue(CHALLENGE);
    api.verifyExportStepUp.mockResolvedValue('act-token');
    api.requestDataExport.mockResolvedValue(SUBMITTED);
  });

  it('opens on the category and format choice', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('data-export')).toBeTruthy();
    expect(getByTestId('export-submit')).toBeTruthy();
    expect(getByTestId('export-verification-note')).toBeTruthy();
  });

  it('asks for a step-up before anything is exported', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('export-submit'));

    await waitFor(() => expect(api.requestExportStepUp).toHaveBeenCalledTimes(1));
    expect(api.requestDataExport).not.toHaveBeenCalled();
  });

  it('moves to the code entry once the challenge is sent', async () => {
    const { getByTestId } = await renderScreen();

    await toVerify(getByTestId as never);

    expect(getByTestId('export-verify')).toBeTruthy();
  });

  // The distinction that matters to a data subject, and to a regulator reading the transcript.
  // Asserted as "these two say DIFFERENT things" rather than against the English copy, which is a
  // translator's to change and not a behaviour.
  it('distinguishes a right that is not switched on from one that failed', async () => {
    async function messageFor(reason: unknown): Promise<string> {
      api.requestExportStepUp.mockRejectedValue(reason);
      const { getByTestId } = await renderScreen();
      await fireEvent.press(getByTestId('export-submit'));
      await waitFor(() => expect(getByTestId('export-error')).toBeTruthy());
      return String(getByTestId('export-error').props.children);
    }

    const notAvailable = await messageFor(FLAG_OFF);
    const failed = await messageFor(new Error('network'));

    expect(notAvailable).not.toBe(failed);
    expect(notAvailable).not.toBe('');
    expect(failed).not.toBe('');
  });

  // ONE gesture: verify and request, because the token is spent on first use and lives five minutes.
  it('verifies and requests in one step', async () => {
    const { getByTestId } = await renderScreen();
    await toVerify(getByTestId as never);

    await fireEvent.changeText(getByTestId('export-code'), '123456');
    await fireEvent.press(getByTestId('export-verify'));

    await waitFor(() => expect(api.verifyExportStepUp).toHaveBeenCalledWith('123456'));
    expect(api.requestDataExport).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'JSON', actionToken: 'act-token' }),
    );
  });

  it('carries the chosen format through to the request', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('export-format-CSV'));
    await toVerify(getByTestId as never);
    await fireEvent.changeText(getByTestId('export-code'), '123456');
    await fireEvent.press(getByTestId('export-verify'));

    await waitFor(() => expect(api.requestDataExport).toHaveBeenCalledTimes(1));
    expect(api.requestDataExport.mock.calls[0][0].format).toBe('CSV');
  });

  it('shows the result once the request is filed', async () => {
    const { getByTestId } = await renderScreen();
    await toVerify(getByTestId as never);

    await fireEvent.changeText(getByTestId('export-code'), '123456');
    await fireEvent.press(getByTestId('export-verify'));

    // PENDING is the server's word; QUEUED is the reader's — STAGE_BY_STATUS maps between them.
    await waitFor(() => expect(getByTestId('export-result-QUEUED')).toBeTruthy());
  });

  // Same message either way — see the note at the top of this file.
  it('gives a wrong code and an expired one the same answer', async () => {
    const { getByTestId } = await renderScreen();
    await toVerify(getByTestId as never);

    api.verifyExportStepUp.mockRejectedValue(new Error('invalid'));
    await fireEvent.changeText(getByTestId('export-code'), '000000');
    await fireEvent.press(getByTestId('export-verify'));
    await waitFor(() => expect(getByTestId('export-code-error')).toBeTruthy());
    const wrong = String(getByTestId('export-code-error').props.children);

    api.verifyExportStepUp.mockRejectedValue(new Error('expired'));
    await fireEvent.press(getByTestId('export-verify'));
    await waitFor(() => expect(getByTestId('export-code-error')).toBeTruthy());

    expect(String(getByTestId('export-code-error').props.children)).toBe(wrong);
  });

  it('keeps the code entry open after a rejection so it can be retried', async () => {
    api.verifyExportStepUp.mockRejectedValue(new Error('invalid'));

    const { getByTestId } = await renderScreen();
    await toVerify(getByTestId as never);

    await fireEvent.changeText(getByTestId('export-code'), '000000');
    await fireEvent.press(getByTestId('export-verify'));

    await waitFor(() => expect(getByTestId('export-code-error')).toBeTruthy());
    expect(getByTestId('export-verify')).toBeTruthy();
    expect(api.requestDataExport).not.toHaveBeenCalled();
  });
});
