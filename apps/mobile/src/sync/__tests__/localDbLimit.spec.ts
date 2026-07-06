import { MAX_LOCAL_DB_BYTES, LOCAL_DB_WARN_BYTES, localDbStatus } from '../localDbLimit';

describe('§17.7 local DB size limit', () => {
  it('caps the local DB at 500 MB with a 90% warn line', () => {
    expect(MAX_LOCAL_DB_BYTES).toBe(500 * 1024 * 1024);
    expect(LOCAL_DB_WARN_BYTES).toBe(Math.floor(500 * 1024 * 1024 * 0.9));
  });

  it('returns FULL at or above 500 MB', () => {
    expect(localDbStatus(MAX_LOCAL_DB_BYTES)).toBe('FULL');
    expect(localDbStatus(MAX_LOCAL_DB_BYTES + 1)).toBe('FULL');
  });

  it('returns WARN between 450 MB and 500 MB', () => {
    expect(localDbStatus(LOCAL_DB_WARN_BYTES)).toBe('WARN');
    expect(localDbStatus(MAX_LOCAL_DB_BYTES - 1)).toBe('WARN');
  });

  it('returns OK below the warn line', () => {
    expect(localDbStatus(0)).toBe('OK');
    expect(localDbStatus(LOCAL_DB_WARN_BYTES - 1)).toBe('OK');
  });
});
