// Jest mock for 'react-native-secure-sign'.
//
// Wraps the Android Keystore / iOS Secure Enclave, so there is nothing to run off-device — and the
// package ships untranspiled ESM, which fails to parse before it even gets that far. Reached from
// src/lib/deviceTrust.ts, which src/store/authStore.ts imports, so every spec touching auth needs it.
//
// The signature is deterministic and derived from the input rather than a fixed string: a test
// asserting that two different payloads produce two different signatures still means something.

import { createHash } from 'node:crypto';

const keys = new Map<string, string>();

export async function generate(alias: string): Promise<string> {
  const publicKey = createHash('sha256').update(`public:${alias}`).digest('base64');
  keys.set(alias, publicKey);
  return publicKey;
}

export async function getPublicKey(alias: string): Promise<string | null> {
  return keys.get(alias) ?? null;
}

export async function sign(alias: string, payload: string): Promise<string> {
  return createHash('sha256').update(`${alias}:${payload}`).digest('base64');
}
