// Unit tests for secret-cipher (AES-256-GCM) — covers key resolution branches + roundtrip + tamper.

import { encryptSecret, decryptSecret } from '../secret-cipher';

const KEY_HEX = 'a'.repeat(64); // 32 bytes

describe('secret-cipher', () => {
  const prevKey = process.env['APP_SECRET_ENCRYPTION_KEY'];
  const prevEnv = process.env['NODE_ENV'];

  afterEach(() => {
    const restore = (k: string, v: string | undefined) =>
      v === undefined ? delete process.env[k] : (process.env[k] = v);
    restore('APP_SECRET_ENCRYPTION_KEY', prevKey);
    restore('NODE_ENV', prevEnv);
  });

  it('round-trips a secret with an explicit 32-byte key', () => {
    process.env['APP_SECRET_ENCRYPTION_KEY'] = KEY_HEX;
    const blob = encryptSecret('MYTOTPSEED');
    expect(blob).not.toContain('MYTOTPSEED');
    expect(blob.split(':')).toHaveLength(3);
    expect(decryptSecret(blob)).toBe('MYTOTPSEED');
  });

  it('produces a different ciphertext each call (random IV) but decrypts to the same value', () => {
    process.env['APP_SECRET_ENCRYPTION_KEY'] = KEY_HEX;
    const a = encryptSecret('SEED');
    const b = encryptSecret('SEED');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('SEED');
    expect(decryptSecret(b)).toBe('SEED');
  });

  it('falls back to the dev key when APP_SECRET_ENCRYPTION_KEY is unset and not production', () => {
    delete process.env['APP_SECRET_ENCRYPTION_KEY'];
    process.env['NODE_ENV'] = 'development';
    const blob = encryptSecret('DEVSEED');
    expect(decryptSecret(blob)).toBe('DEVSEED');
  });

  it('throws in production when APP_SECRET_ENCRYPTION_KEY is unset (fail-fast)', () => {
    delete process.env['APP_SECRET_ENCRYPTION_KEY'];
    process.env['NODE_ENV'] = 'production';
    expect(() => encryptSecret('X')).toThrow('APP_SECRET_ENCRYPTION_KEY must be set in production');
  });

  it('throws when the key is not 32 bytes', () => {
    process.env['APP_SECRET_ENCRYPTION_KEY'] = 'abcd'; // 2 bytes
    expect(() => encryptSecret('X')).toThrow('must be 32 bytes');
  });

  it('throws on a malformed blob (wrong number of segments)', () => {
    process.env['APP_SECRET_ENCRYPTION_KEY'] = KEY_HEX;
    expect(() => decryptSecret('onlyonepart')).toThrow('Malformed encrypted secret');
  });

  it('throws on a tampered ciphertext (GCM auth tag mismatch)', () => {
    process.env['APP_SECRET_ENCRYPTION_KEY'] = KEY_HEX;
    const [iv, tag, data] = encryptSecret('SEED').split(':');
    const tampered = `${iv}:${tag}:${data!.slice(0, -2)}00`;
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
