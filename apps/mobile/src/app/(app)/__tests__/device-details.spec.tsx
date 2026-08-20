// Behaviour of the device-details screen — what this handset is trusted for, and why.
//
// The trust score is ADVISORY (§22.3): it never revokes a device and never blocks a login. It sits
// behind a flag that answers 503 when off, and the screen renders everything else without the panel
// rather than treating that as an error — the rest is stored fact and still worth showing.
//
// TWO CLAIMS THIS SCREEN MUST NOT MAKE. ADR-081 forbids describing the score as AI-derived while
// `scoredBy` reads RULES: claiming AI over an if-chain is the same class of dishonesty as the static
// 98% the ADR removed. And the root/jailbreak row has FOUR outcomes, not two — rendering
// UNAVAILABLE or NOT_ATTEMPTED as PASSED would claim a check that never happened.

import { render, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import DeviceDetailsScreen from '../device-details';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../../api/devices', () => ({
  ...jest.requireActual('../../../api/devices'),
  listDevices: jest.fn(),
  getDeviceTrustScore: jest.fn(),
}));
jest.mock('../../../lib/deviceTrust', () => ({ getDeviceId: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../../../api/devices') as {
  listDevices: jest.Mock;
  getDeviceTrustScore: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const trust = require('../../../lib/deviceTrust') as { getDeviceId: jest.Mock };

const THIS_DEVICE = 'dev-this';

function device(over: Partial<Record<string, unknown>> = {}) {
  return {
    deviceId: THIS_DEVICE,
    platform: 'android',
    model: 'Pixel 6',
    lastSeenAt: '2026-08-19T09:00:00Z',
    createdAt: '2026-08-01T09:00:00Z',
    expiresAt: '2026-11-01T09:00:00Z',
    attestationVerdict: 'PASSED',
    integrityLevel: 'MEETS_STRONG_INTEGRITY',
    attestedAt: '2026-08-19T09:00:00Z',
    osVersion: '34',
    ...over,
  };
}

function report(over: Partial<Record<string, unknown>> = {}) {
  return {
    deviceId: THIS_DEVICE,
    score: 82,
    maxScore: 100,
    capped: false,
    scoredBy: 'RULES',
    rulesVersion: 'v3',
    signals: [
      { signal: 'attestation', band: 'STRONG', points: 40, maxPoints: 40 },
      { signal: 'recency', band: 'RECENT', points: 20, maxPoints: 20 },
    ],
    ...over,
  };
}

function renderScreen() {
  return render(
    <I18nProvider>
      <DeviceDetailsScreen />
    </I18nProvider>,
  );
}

describe('DeviceDetailsScreen', () => {
  beforeEach(() => {
    trust.getDeviceId.mockReset();
    api.listDevices.mockReset();
    api.getDeviceTrustScore.mockReset();
    trust.getDeviceId.mockResolvedValue(THIS_DEVICE);
    api.listDevices.mockResolvedValue([device()]);
    api.getDeviceTrustScore.mockResolvedValue(report());
  });

  it('shows the enrolment facts for the handset in your hand', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('device-install-id')).toBeTruthy());
    expect(getByTestId('device-model')).toBeTruthy();
    expect(getByTestId('device-binding')).toBeTruthy();
  });

  it('says so when this install is not enrolled', async () => {
    api.listDevices.mockResolvedValue([device({ deviceId: 'someone-else' })]);

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('device-not-enrolled')).toBeTruthy());
  });

  it('says so when the device list cannot be fetched', async () => {
    api.listDevices.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('device-not-enrolled')).toBeTruthy());
  });

  it('shows the trust score and the signals behind it', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('device-score')).toBeTruthy());
    expect(getByTestId('device-signal-attestation')).toBeTruthy();
    expect(getByTestId('device-signal-recency')).toBeTruthy();
  });

  // ADR-081. RULES is an if-chain, and the badge has to say so.
  it('badges a rule-based score as rule-based, not as AI', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('device-scorer-RULE_BASED')).toBeTruthy());
    expect(queryByTestId('device-scorer-AI_VERIFIED')).toBeNull();
  });

  it('badges a model score as AI-verified', async () => {
    api.getDeviceTrustScore.mockResolvedValue(report({ scoredBy: 'MODEL' }));

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('device-scorer-AI_VERIFIED')).toBeTruthy());
    expect(queryByTestId('device-scorer-RULE_BASED')).toBeNull();
  });

  it('says which finding held the score down when one did', async () => {
    api.getDeviceTrustScore.mockResolvedValue(
      report({
        capped: true,
        score: 40,
        signals: [
          { signal: 'attestation', band: 'FAILED', points: 0, maxPoints: 40 },
          { signal: 'recency', band: 'RECENT', points: 20, maxPoints: 20 },
        ],
      }),
    );

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('device-capped')).toBeTruthy());
  });

  it('says nothing about a cap when nothing capped it', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('device-score')).toBeTruthy());
    expect(queryByTestId('device-capped')).toBeNull();
  });

  // ADVISORY, and behind a flag that answers 503 when off. The rest of the screen is stored fact.
  it('renders the stored facts without the score panel when the score is unavailable', async () => {
    api.getDeviceTrustScore.mockRejectedValue(new Error('503'));

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('device-install-id')).toBeTruthy());
    expect(getByTestId('device-model')).toBeTruthy();
    expect(queryByTestId('device-score')).toBeNull();
  });

  // FOUR OUTCOMES, not two — rendering the last two as PASSED claims a check that never happened.
  it('reads a passed attestation as passed', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('device-integrity-PASSED')).toBeTruthy());
  });

  // The enum is PASSED / FAILED / UNAVAILABLE — a fixture spelling it 'FAIL' passes the PASSED
  // branch by falling through, which is a test that proves nothing.
  it('reads a failed attestation as failed, not as passed', async () => {
    api.listDevices.mockResolvedValue([
      device({ attestationVerdict: 'FAILED', integrityLevel: null }),
    ]);

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('device-integrity-FAILED')).toBeTruthy());
    expect(queryByTestId('device-integrity-PASSED')).toBeNull();
  });

  it('reads an unavailable answer as unavailable, not as passed', async () => {
    api.listDevices.mockResolvedValue([
      device({ attestationVerdict: 'UNAVAILABLE', integrityLevel: null }),
    ]);

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('device-integrity-UNAVAILABLE')).toBeTruthy());
    expect(queryByTestId('device-integrity-PASSED')).toBeNull();
  });

  it('reads an enrolment that predates attestation as not attempted, not as passed', async () => {
    api.listDevices.mockResolvedValue([
      device({ attestationVerdict: null, integrityLevel: null, attestedAt: null }),
    ]);

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('device-integrity-NOT_ATTEMPTED')).toBeTruthy());
    expect(queryByTestId('device-integrity-PASSED')).toBeNull();
  });
});
