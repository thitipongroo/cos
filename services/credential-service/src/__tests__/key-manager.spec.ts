import {
  generateIssuerKey,
  generateEphemeralSignerKey,
  decryptIssuerPrivateKey,
} from '../key-manager.js';

describe('key-manager (ADR-019)', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.APP_SECRET_ENCRYPTION_KEY;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('generateIssuerKey returns a public multibase + a decryptable encrypted private key', async () => {
    const { publicKeyMultibase, encryptedPrivateKey } = await generateIssuerKey();
    expect(publicKeyMultibase).toMatch(/^z6Mk/);
    expect(encryptedPrivateKey.split(':')).toHaveLength(3);
    expect(decryptIssuerPrivateKey(encryptedPrivateKey)).toMatch(/^z/); // recovers the private multibase
  });

  it('generateEphemeralSignerKey returns a public + private multibase (not persisted)', async () => {
    const { publicKeyMultibase, privateKeyMultibase } = await generateEphemeralSignerKey();
    expect(publicKeyMultibase).toMatch(/^z6Mk/);
    expect(typeof privateKeyMultibase).toBe('string');
  });
});
