// Device trust (§20.6.1) — the mobile half of ADR-054.
//
// Wraps react-native-secure-sign: a non-extractable P-256 key lives in the Secure Enclave (iOS) /
// Android Keystore and signs a server challenge to prove this device is trusted. Every function is
// defensive — a missing key, an unsupported device, or a native failure degrades to "untrusted", it
// NEVER throws into the login flow. The private key never leaves secure hardware; only the SPKI
// public key is sent to the server.

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { generate, sign, getPublicKey } from 'react-native-secure-sign';

// Stable per-install id (the server's deviceId) and the Keystore/Enclave alias for the signing key.
const INSTALL_ID_KEY = 'cos.device.installId';
const KEY_ALIAS = 'cos.device.trust';

export type DevicePlatform = 'ios' | 'android';

/** The per-install id, minted once (base64url UUID) and kept in secure storage. */
export async function getDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(INSTALL_ID_KEY);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await SecureStore.setItemAsync(INSTALL_ID_KEY, id);
  return id;
}

export function devicePlatform(): DevicePlatform {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

/** Best-effort human-readable model (Android exposes it via Platform.constants; iOS often does not). */
export function deviceModel(): string | null {
  const c = Platform.constants as { Model?: string } | undefined;
  return c?.Model ?? null;
}

/** True once this install has a hardware signing key — i.e. it has enrolled at least once before. */
export async function hasDeviceKey(): Promise<boolean> {
  try {
    await getPublicKey(KEY_ALIAS);
    return true;
  } catch {
    return false;
  }
}

/** Ensure the hardware keypair exists; return its base64url SPKI public key, or null on failure. */
export async function ensureDeviceKey(): Promise<string | null> {
  try {
    return await getPublicKey(KEY_ALIAS);
  } catch {
    try {
      // The options arg is required by the TurboModule binding. requireUserAuthentication:false keeps
      // signing non-interactive (no biometric prompt) — the trust check must run silently.
      return await generate(KEY_ALIAS, { requireUserAuthentication: false });
    } catch {
      return null;
    }
  }
}

/** Sign a base64url challenge with the device key. Null when there is no key or signing fails. */
export async function signChallenge(challenge: string): Promise<string | null> {
  try {
    return await sign(KEY_ALIAS, challenge);
  } catch {
    return null;
  }
}
