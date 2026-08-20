// Behaviour of the device re-attestation screen.
//
// The rule this screen exists to keep is a distinction about EVIDENCE. A null signature means this
// install has no hardware key — an older enrolment, or a keystore that refused — and that is
// UNAVAILABLE, never a failure claim about the device. Nothing was disproved; the proof simply could
// not be produced. Calling it a failure would put a red mark against a handset on the strength of
// something that was never measured, and this screen is read by whoever decides whether to trust it.
//
// A thrown request is the same answer for the same reason: an unreachable endpoint says nothing
// about the device in the reader's hand.

import { render, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import NetworkReattestScreen from '../network-reattest';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn() }),
}));

jest.mock('../../../api/devices', () => ({
  ...jest.requireActual('../../../api/devices'),
  requestAttestationChallenge: jest.fn(),
}));
jest.mock('../../../lib/deviceTrust', () => ({
  getDeviceId: jest.fn(),
  signChallenge: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../../../api/devices') as { requestAttestationChallenge: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const trust = require('../../../lib/deviceTrust') as {
  getDeviceId: jest.Mock;
  signChallenge: jest.Mock;
};

function renderScreen() {
  return render(
    <I18nProvider>
      <NetworkReattestScreen />
    </I18nProvider>,
  );
}

describe('NetworkReattestScreen', () => {
  beforeEach(() => {
    mockBack.mockReset();
    api.requestAttestationChallenge.mockReset();
    trust.getDeviceId.mockReset();
    trust.signChallenge.mockReset();
    trust.getDeviceId.mockResolvedValue('dev-1');
    api.requestAttestationChallenge.mockResolvedValue('challenge-abc');
    trust.signChallenge.mockResolvedValue('signature-xyz');
  });

  it('starts the attestation on arrival, without a tap', async () => {
    await renderScreen();

    await waitFor(() => expect(api.requestAttestationChallenge).toHaveBeenCalledWith('dev-1'));
  });

  it('signs the challenge the server issued', async () => {
    await renderScreen();

    await waitFor(() => expect(trust.signChallenge).toHaveBeenCalledWith('challenge-abc'));
  });

  it('reports the attestation as refreshed when the key signed', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('reattest-at')).toBeTruthy());
  });

  // THE DISTINCTION. No key is not a failed proof — it is no proof.
  it('says unavailable, not failed, when the install has no hardware key', async () => {
    trust.signChallenge.mockResolvedValue(null);

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('reattest-unavailable')).toBeTruthy());
    expect(queryByTestId('reattest-at')).toBeNull();
  });

  // An unreachable endpoint says nothing about the device in the reader's hand.
  it('says unavailable when the challenge could not be fetched', async () => {
    api.requestAttestationChallenge.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('reattest-unavailable')).toBeTruthy());
  });

  it('says unavailable when the device id could not be read', async () => {
    trust.getDeviceId.mockRejectedValue(new Error('no id'));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('reattest-unavailable')).toBeTruthy());
    expect(api.requestAttestationChallenge).not.toHaveBeenCalled();
  });

  it('says unavailable when signing itself threw', async () => {
    trust.signChallenge.mockRejectedValue(new Error('keystore refused'));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('reattest-unavailable')).toBeTruthy());
  });

  // No timestamp on an unavailable outcome: a time would imply something happened at it.
  it('records no time when nothing was proved', async () => {
    trust.signChallenge.mockResolvedValue(null);

    const { queryByTestId } = await renderScreen();

    await waitFor(() => expect(queryByTestId('reattest-unavailable')).toBeTruthy());
    expect(queryByTestId('reattest-at')).toBeNull();
  });

  it('offers a way back whatever the outcome', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('reattest-back')).toBeTruthy());
  });

  it('offers a way back after an unavailable outcome too', async () => {
    trust.signChallenge.mockResolvedValue(null);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('reattest-back')).toBeTruthy());
  });
});
