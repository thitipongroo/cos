import { encryptSecret, decryptSecret } from '../secret-cipher.js';

describe('secret-cipher (AES-256-GCM, ADR-035)', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('round-trips with the dev key (NODE_ENV != production)', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.APP_SECRET_ENCRYPTION_KEY;
    const blob = encryptSecret('z-private-key-material');
    expect(blob.split(':')).toHaveLength(3);
    expect(decryptSecret(blob)).toBe('z-private-key-material');
  });

  it('round-trips with a provided 32-byte env key', () => {
    process.env.APP_SECRET_ENCRYPTION_KEY = 'a'.repeat(64);
    expect(decryptSecret(encryptSecret('secret'))).toBe('secret');
  });

  it('throws in production when the key is unset', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.APP_SECRET_ENCRYPTION_KEY;
    expect(() => encryptSecret('x')).toThrow(/must be set in production/);
  });

  it('throws when the env key is the wrong length', () => {
    process.env.APP_SECRET_ENCRYPTION_KEY = 'abcd';
    expect(() => encryptSecret('x')).toThrow(/32 bytes/);
  });

  it('rejects a malformed blob', () => {
    expect(() => decryptSecret('only:two')).toThrow(/Malformed encrypted secret/);
  });

  it('rejects a tampered ciphertext (GCM auth failure)', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.APP_SECRET_ENCRYPTION_KEY;
    const [iv, tag, ct] = encryptSecret('secret').split(':');
    const tampered = `${iv}:${tag}:${ct.slice(0, -2)}00`;
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
