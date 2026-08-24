// Jest mock for 'expo-crypto'.
//
// The real module loads expo-modules-core, which reaches for the native runtime at import time and
// throws off-device. Backed by node:crypto rather than stubbed to constants — code under test hashes
// and generates ids for real, so an assertion on "two different rows got two different ids" still
// means something.

import { createHash, randomUUID as nodeRandomUUID } from 'node:crypto';

export const CryptoDigestAlgorithm = {
  SHA1: 'SHA-1',
  SHA256: 'SHA-256',
  SHA384: 'SHA-384',
  SHA512: 'SHA-512',
} as const;

export const CryptoEncoding = {
  HEX: 'hex',
  BASE64: 'base64',
} as const;

type Algorithm = (typeof CryptoDigestAlgorithm)[keyof typeof CryptoDigestAlgorithm];
type Encoding = (typeof CryptoEncoding)[keyof typeof CryptoEncoding];

function nodeAlgorithm(algorithm: Algorithm): string {
  return algorithm.replace('-', '').toLowerCase();
}

export function randomUUID(): string {
  return nodeRandomUUID();
}

export async function digestStringAsync(
  algorithm: Algorithm,
  data: string,
  options?: { encoding?: Encoding },
): Promise<string> {
  return createHash(nodeAlgorithm(algorithm))
    .update(data, 'utf8')
    .digest(options?.encoding === CryptoEncoding.BASE64 ? 'base64' : 'hex');
}

export async function digest(algorithm: Algorithm, data: BufferSource): Promise<ArrayBuffer> {
  const bytes =
    data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer as ArrayBuffer);
  const out = createHash(nodeAlgorithm(algorithm)).update(bytes).digest();
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}
