// Unit tests — appDatabaseUrl(): must return APP_DATABASE_URL when set and fail loudly (never fall
// back to the RLS-bypassing DATABASE_URL superuser) when it is missing (spec §7.7, QM-18).

import { appDatabaseUrl } from '../app-database-url';

describe('appDatabaseUrl', () => {
  const ORIGINAL = process.env['APP_DATABASE_URL'];

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env['APP_DATABASE_URL'];
    else process.env['APP_DATABASE_URL'] = ORIGINAL;
  });

  it('returns APP_DATABASE_URL when set', () => {
    process.env['APP_DATABASE_URL'] = 'postgresql://app_user:pw@pgbouncer:6432/cos';
    expect(appDatabaseUrl()).toBe('postgresql://app_user:pw@pgbouncer:6432/cos');
  });

  it('throws when APP_DATABASE_URL is unset — no superuser fallback', () => {
    delete process.env['APP_DATABASE_URL'];
    expect(() => appDatabaseUrl()).toThrow(/APP_DATABASE_URL is not set/);
  });

  it('throws when APP_DATABASE_URL is an empty string', () => {
    process.env['APP_DATABASE_URL'] = '';
    expect(() => appDatabaseUrl()).toThrow(/RLS/);
  });
});
