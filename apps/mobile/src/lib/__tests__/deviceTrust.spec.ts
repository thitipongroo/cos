// Device-trust lib (§20.6.1) — every function degrades to a safe "untrusted" value rather than
// throwing into the login flow. The native module, secure store, and crypto are mocked; the tests
// pin the graceful-failure branches that keep a broken key store from ever blocking a sign-in.

const secureSign = {
  generate: jest.fn(),
  sign: jest.fn(),
  getPublicKey: jest.fn(),
};
const store: Record<string, string> = {};

jest.mock('react-native-secure-sign', () => secureSign);
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
  setItemAsync: jest.fn((k: string, v: string) => {
    store[k] = v;
    return Promise.resolve();
  }),
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'uuid-1234') }));

import { Platform } from 'react-native';
import {
  getDeviceId,
  devicePlatform,
  deviceModel,
  hasDeviceKey,
  ensureDeviceKey,
  signChallenge,
} from '../deviceTrust';

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(store)) delete store[k];
});

describe('getDeviceId', () => {
  it('mints and persists an id on first call', async () => {
    const id = await getDeviceId();
    expect(id).toBe('uuid-1234');
  });

  it('returns the persisted id on subsequent calls', async () => {
    store['cos.device.installId'] = 'existing-id';
    expect(await getDeviceId()).toBe('existing-id');
  });
});

describe('devicePlatform / deviceModel', () => {
  it('maps Platform.OS to ios/android', () => {
    (Platform as { OS: string }).OS = 'ios';
    expect(devicePlatform()).toBe('ios');
    (Platform as { OS: string }).OS = 'android';
    expect(devicePlatform()).toBe('android');
  });

  it('reads the model from Platform.constants when present, else null', () => {
    (Platform as { constants?: unknown }).constants = { Model: 'Pixel 8' };
    expect(deviceModel()).toBe('Pixel 8');
    (Platform as { constants?: unknown }).constants = {};
    expect(deviceModel()).toBeNull();
    (Platform as { constants?: unknown }).constants = undefined;
    expect(deviceModel()).toBeNull();
  });
});

describe('hasDeviceKey', () => {
  it('is true when a key exists', async () => {
    secureSign.getPublicKey.mockResolvedValue('PUB');
    expect(await hasDeviceKey()).toBe(true);
  });

  it('is false when there is no key', async () => {
    secureSign.getPublicKey.mockRejectedValue(new Error('no key'));
    expect(await hasDeviceKey()).toBe(false);
  });
});

describe('ensureDeviceKey', () => {
  it('returns the existing public key', async () => {
    secureSign.getPublicKey.mockResolvedValue('PUB');
    expect(await ensureDeviceKey()).toBe('PUB');
    expect(secureSign.generate).not.toHaveBeenCalled();
  });

  it('generates a key when none exists', async () => {
    secureSign.getPublicKey.mockRejectedValue(new Error('no key'));
    secureSign.generate.mockResolvedValue('NEW_PUB');
    expect(await ensureDeviceKey()).toBe('NEW_PUB');
  });

  it('returns null when key generation fails', async () => {
    secureSign.getPublicKey.mockRejectedValue(new Error('no key'));
    secureSign.generate.mockRejectedValue(new Error('hw unavailable'));
    expect(await ensureDeviceKey()).toBeNull();
  });
});

describe('signChallenge', () => {
  it('returns the signature on success', async () => {
    secureSign.sign.mockResolvedValue('SIG');
    expect(await signChallenge('CH')).toBe('SIG');
    expect(secureSign.sign).toHaveBeenCalledWith('cos.device.trust', 'CH');
  });

  it('returns null when signing fails', async () => {
    secureSign.sign.mockRejectedValue(new Error('boom'));
    expect(await signChallenge('CH')).toBeNull();
  });
});
