// Jest mock for '@expo/app-integrity'.
//
// Loads expo-modules-core (native runtime) at import time, and src/store/authStore.ts imports it
// transitively via lib/appIntegrity.ts — so ANY spec that touches the auth store needs it.
//
// isSupported is FALSE by default: attestation is a device capability, and off-device the honest
// answer is "not available". lib/appIntegrity.ts is written to degrade on that path, which is the
// behaviour a render test should exercise. A spec that wants the attested path can jest.mock() this
// per-file with its own answers.

export const isSupported = false;

export async function generateKeyAsync(): Promise<string> {
  throw new Error('app integrity is not supported in tests');
}

export async function attestKeyAsync(): Promise<string> {
  throw new Error('app integrity is not supported in tests');
}

export async function prepareIntegrityTokenProviderAsync(): Promise<void> {
  throw new Error('app integrity is not supported in tests');
}

export async function requestIntegrityCheckAsync(): Promise<string> {
  throw new Error('app integrity is not supported in tests');
}
