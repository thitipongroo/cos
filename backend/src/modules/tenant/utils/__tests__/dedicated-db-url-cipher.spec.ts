// Unit tests — dedicated_db_url encryption at rest (security review F5b).

jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import {
  encryptDedicatedDbUrl,
  decryptDedicatedDbUrl,
  ENCRYPTED_DB_URL_FLAG,
} from '../dedicated-db-url-cipher';

const URL_PG = 'postgresql://app_user:s3cr3t@tenant-db.internal:5432/cos';
const URL_SHORT = 'postgres://app_user:s3cr3t@tenant-db.internal:5432/cos';

describe('dedicated_db_url cipher', () => {
  it('exposes the QM-15 flag name the write paths gate on', () => {
    expect(ENCRYPTED_DB_URL_FLAG).toBe('s1.tenant.encrypted-db-url');
  });

  it('round-trips an encrypted URL', () => {
    const stored = encryptDedicatedDbUrl(URL_PG, true);
    expect(stored).not.toContain('s3cr3t'); // the password must not survive in the stored form
    expect(decryptDedicatedDbUrl(stored)).toBe(URL_PG);
  });

  it('produces a different blob each time (random IV) for the same input', () => {
    expect(encryptDedicatedDbUrl(URL_PG, true)).not.toBe(encryptDedicatedDbUrl(URL_PG, true));
  });

  it('passes the URL through unchanged when the flag is off', () => {
    expect(encryptDedicatedDbUrl(URL_PG, false)).toBe(URL_PG);
  });

  // The migration path that makes this safe to ship with no backfill (QM-9): rows written before the
  // flag existed are plaintext, and reads must keep understanding them forever.
  it.each([URL_PG, URL_SHORT])('reads legacy plaintext unchanged: %s', (plain) => {
    expect(decryptDedicatedDbUrl(plain)).toBe(plain);
  });

  it('reads a value written while the flag was off, then one written while it was on', () => {
    expect(decryptDedicatedDbUrl(encryptDedicatedDbUrl(URL_PG, false))).toBe(URL_PG);
    expect(decryptDedicatedDbUrl(encryptDedicatedDbUrl(URL_PG, true))).toBe(URL_PG);
  });

  // Falling back to the shared database on an undecryptable value would silently route one tenant's
  // queries at another tenant's data, so this must fail loudly instead.
  it('throws rather than guessing when the blob cannot be authenticated', () => {
    const stored = encryptDedicatedDbUrl(URL_PG, true);
    const tampered = stored.slice(0, -2) + (stored.endsWith('00') ? '11' : '00');
    expect(() => decryptDedicatedDbUrl(tampered)).toThrow(/APP_SECRET_ENCRYPTION_KEY/);
  });

  it('throws on a malformed stored value that is neither URL nor cipher blob', () => {
    expect(() => decryptDedicatedDbUrl('garbage')).toThrow(/APP_SECRET_ENCRYPTION_KEY/);
  });
});
