// Platform attestation client (ADR-082 / ADR-083).
//
// The bug this file exists to prevent: THE TWO PLATFORMS HASH IN DIFFERENT PLACES, and getting it
// backwards fails silently. iOS hands over the RAW challenge because IntegrityModule.swift computes
// `SHA256(utf8(challenge))` itself; Android hands over a digest because `setRequestHash` is a
// pass-through. Reverse either and the server simply cannot match the token — which surfaces as
// "attestation unavailable", not as an error, and would survive a release.
//
// The second invariant: nothing here ever throws or blocks enrolment. Every failure returns null and
// the device enrols without a verdict (ADR-054's non-blocking guarantee).

const mockPlatform = { OS: 'ios' };
const mockSecureStore = {
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
};
const mockCrypto = {
  digestStringAsync: jest.fn(),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
};
const mockAppIntegrity = {
  isSupported: true,
  generateKeyAsync: jest.fn(),
  attestKeyAsync: jest.fn(),
  prepareIntegrityTokenProviderAsync: jest.fn(),
  requestIntegrityCheckAsync: jest.fn(),
};

jest.mock('react-native', () => ({ Platform: mockPlatform }));
jest.mock('expo-secure-store', () => mockSecureStore);
jest.mock('expo-crypto', () => mockCrypto);
jest.mock('@expo/app-integrity', () => mockAppIntegrity);

import { attest, buildRequestHash } from '../appIntegrity';

const CHALLENGE = 'CHAL_B64U';
const DEVICE = 'dev-1';

beforeEach(() => {
  jest.clearAllMocks();
  mockPlatform.OS = 'ios';
  mockAppIntegrity.isSupported = true;
  mockSecureStore.setItemAsync.mockResolvedValue(undefined);
  mockCrypto.digestStringAsync.mockResolvedValue('DIGEST');
  delete process.env.EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER;
});

describe('buildRequestHash', () => {
  it('digests challenge and deviceId together, base64', async () => {
    // The device id is folded in so the token binds to the enrolling install, not just to the nonce.
    await buildRequestHash(CHALLENGE, DEVICE);
    expect(mockCrypto.digestStringAsync).toHaveBeenCalledWith('SHA-256', `${CHALLENGE}|${DEVICE}`, {
      encoding: 'base64',
    });
  });
});

describe('attest — iOS', () => {
  it('passes the RAW challenge, because the native layer hashes it', async () => {
    // IntegrityModule.swift: `clientDataHash = Data(SHA256.hash(data: Data(challenge.utf8)))`.
    // Pre-hashing here would double-hash and the server could never match it.
    mockSecureStore.getItemAsync.mockResolvedValue('KEY_ID');
    mockAppIntegrity.attestKeyAsync.mockResolvedValue('ATTESTATION');

    await expect(attest(CHALLENGE, DEVICE)).resolves.toEqual({
      attestationToken: 'ATTESTATION',
      attestationChallenge: CHALLENGE,
      attestationKeyId: 'KEY_ID',
    });
    expect(mockAppIntegrity.attestKeyAsync).toHaveBeenCalledWith('KEY_ID', CHALLENGE);
    // Not hashed on this platform, at all.
    expect(mockCrypto.digestStringAsync).not.toHaveBeenCalled();
  });

  it('mints the App Attest key once and reuses it', async () => {
    // Apple's model is one key per app instance, attested once and asserted against thereafter.
    mockSecureStore.getItemAsync.mockResolvedValue(null);
    mockAppIntegrity.generateKeyAsync.mockResolvedValue('NEW_KEY');
    mockAppIntegrity.attestKeyAsync.mockResolvedValue('ATTESTATION');

    await attest(CHALLENGE, DEVICE);
    expect(mockAppIntegrity.generateKeyAsync).toHaveBeenCalledTimes(1);
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      'cos.device.appAttestKeyId',
      'NEW_KEY',
    );

    // Second run finds the stored id and does not mint another.
    mockSecureStore.getItemAsync.mockResolvedValue('NEW_KEY');
    mockAppIntegrity.generateKeyAsync.mockClear();
    await attest(CHALLENGE, DEVICE);
    expect(mockAppIntegrity.generateKeyAsync).not.toHaveBeenCalled();
  });

  it('returns null on a device class without App Attest', async () => {
    mockAppIntegrity.isSupported = false;
    await expect(attest(CHALLENGE, DEVICE)).resolves.toBeNull();
    expect(mockAppIntegrity.attestKeyAsync).not.toHaveBeenCalled();
  });

  it('returns null — never throws — when key generation fails', async () => {
    mockSecureStore.getItemAsync.mockResolvedValue(null);
    mockAppIntegrity.generateKeyAsync.mockRejectedValue(new Error('no secure enclave'));
    await expect(attest(CHALLENGE, DEVICE)).resolves.toBeNull();
  });

  it('returns null when Apple refuses the attestation', async () => {
    mockSecureStore.getItemAsync.mockResolvedValue('KEY_ID');
    mockAppIntegrity.attestKeyAsync.mockRejectedValue(new Error('invalid key'));
    await expect(attest(CHALLENGE, DEVICE)).resolves.toBeNull();
  });
});

describe('attest — Android', () => {
  beforeEach(() => {
    mockPlatform.OS = 'android';
    process.env.EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER = '123456789';
  });

  it('sends a DIGEST as the request hash, because setRequestHash is a pass-through', async () => {
    // Sending the raw challenge here would put it into the token verbatim and the server's
    // recomputed digest would never match.
    mockCrypto.digestStringAsync.mockResolvedValue('REQUEST_HASH');
    mockAppIntegrity.prepareIntegrityTokenProviderAsync.mockResolvedValue(undefined);
    mockAppIntegrity.requestIntegrityCheckAsync.mockResolvedValue('INTEGRITY_TOKEN');

    await expect(attest(CHALLENGE, DEVICE)).resolves.toEqual({
      attestationToken: 'INTEGRITY_TOKEN',
      attestationChallenge: CHALLENGE,
    });
    expect(mockAppIntegrity.requestIntegrityCheckAsync).toHaveBeenCalledWith('REQUEST_HASH');
    // The raw challenge must never reach the platform call on this side.
    expect(mockAppIntegrity.requestIntegrityCheckAsync).not.toHaveBeenCalledWith(CHALLENGE);
  });

  it('sends no keyId — Play Integrity tokens stand alone', async () => {
    mockAppIntegrity.prepareIntegrityTokenProviderAsync.mockResolvedValue(undefined);
    mockAppIntegrity.requestIntegrityCheckAsync.mockResolvedValue('T');
    const result = await attest(CHALLENGE, DEVICE);
    expect(result).not.toHaveProperty('attestationKeyId');
  });

  it('prepares the token provider before requesting', async () => {
    mockAppIntegrity.prepareIntegrityTokenProviderAsync.mockResolvedValue(undefined);
    mockAppIntegrity.requestIntegrityCheckAsync.mockResolvedValue('T');
    await attest(CHALLENGE, DEVICE);
    expect(mockAppIntegrity.prepareIntegrityTokenProviderAsync).toHaveBeenCalledWith('123456789');
  });

  it('returns null when no cloud project number is configured', async () => {
    // The honest state for a build that has not been wired to a Google Cloud project — and one the
    // backend already models as "this client never offered a token".
    delete process.env.EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER;
    await expect(attest(CHALLENGE, DEVICE)).resolves.toBeNull();
    expect(mockAppIntegrity.prepareIntegrityTokenProviderAsync).not.toHaveBeenCalled();
  });

  it('returns null when the provider cannot be prepared (no Play Services)', async () => {
    mockAppIntegrity.prepareIntegrityTokenProviderAsync.mockRejectedValue(new Error('no play'));
    await expect(attest(CHALLENGE, DEVICE)).resolves.toBeNull();
    expect(mockAppIntegrity.requestIntegrityCheckAsync).not.toHaveBeenCalled();
  });

  it('returns null when the integrity request itself fails', async () => {
    mockAppIntegrity.prepareIntegrityTokenProviderAsync.mockResolvedValue(undefined);
    mockAppIntegrity.requestIntegrityCheckAsync.mockRejectedValue(new Error('provider invalid'));
    await expect(attest(CHALLENGE, DEVICE)).resolves.toBeNull();
  });
});

describe('attest — other platforms', () => {
  it('returns null on web', async () => {
    mockPlatform.OS = 'web';
    await expect(attest(CHALLENGE, DEVICE)).resolves.toBeNull();
  });
});
