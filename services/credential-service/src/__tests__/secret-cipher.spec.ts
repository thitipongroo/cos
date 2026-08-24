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

    // FLIP the last byte rather than OVERWRITING it with a constant.
    //
    // This test read `${ct.slice(0, -2)}00` and failed roughly once in 256 runs — including on CI
    // run 32060998876. `encryptSecret` draws a fresh random IV every call, so the ciphertext differs
    // each time; when it happened to END in `00`, the "tampered" blob was byte-identical to the
    // original, GCM authenticated it, and the expected throw never came. A test whose subject is
    // "reject a MODIFIED ciphertext" must actually modify it, and overwriting with a fixed value
    // cannot guarantee that. XOR 0xff always yields a different byte.
    const lastByte = parseInt(ct.slice(-2), 16);
    const flipped = (lastByte ^ 0xff).toString(16).padStart(2, '0');
    const tampered = `${iv}:${tag}:${ct.slice(0, -2)}${flipped}`;
    expect(tampered).not.toBe(`${iv}:${tag}:${ct}`);

    expect(() => decryptSecret(tampered)).toThrow();
  });
});
