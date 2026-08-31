// ServiceTokenService — the backend's own client-credentials token for internal service calls.
//
// The cache is the interesting part. A token request per call would put a Keycloak round trip in
// front of every file read; a token cached past its expiry would send a dead bearer and turn the
// call into a 401 that looks like a permissions problem. Both failures are invisible in a unit test
// that only asserts "a token comes back", so the clock and the fetch count are what these assert.

import { ServiceTokenService } from '../service-token.service';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function ok(access_token: string, expires_in = 300) {
  return { ok: true, status: 200, json: async () => ({ access_token, expires_in }) };
}

describe('ServiceTokenService', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-31T00:00:00Z'));
    fetchMock.mockReset();
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = OLD_ENV;
  });

  describe('construction', () => {
    it('refuses to start in production without a client secret', () => {
      // A dev default silently reaching production is a backend authenticating with a credential
      // the realm does not know, which fails at the first internal call rather than at boot.
      process.env['NODE_ENV'] = 'production';
      delete process.env['KEYCLOAK_ADMIN_CLIENT_SECRET'];
      expect(() => new ServiceTokenService()).toThrow(
        'KEYCLOAK_ADMIN_CLIENT_SECRET must be set in production',
      );
    });

    it('accepts the dev default outside production', () => {
      process.env['NODE_ENV'] = 'test';
      delete process.env['KEYCLOAK_ADMIN_CLIENT_SECRET'];
      expect(() => new ServiceTokenService()).not.toThrow();
    });
  });

  describe('getToken', () => {
    it('asks the realm token endpoint with client_credentials', async () => {
      process.env['KEYCLOAK_URL'] = 'http://kc:8080';
      process.env['KEYCLOAK_REALM'] = 'cos';
      process.env['KEYCLOAK_ADMIN_CLIENT_ID'] = 'cos-backend';
      process.env['KEYCLOAK_ADMIN_CLIENT_SECRET'] = 's3cret';
      fetchMock.mockResolvedValue(ok('tok-1'));

      await expect(new ServiceTokenService().getToken()).resolves.toBe('tok-1');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://kc:8080/realms/cos/protocol/openid-connect/token');
      expect(init.method).toBe('POST');
      const body = (init.body as URLSearchParams).toString();
      expect(body).toContain('grant_type=client_credentials');
      expect(body).toContain('client_id=cos-backend');
      expect(body).toContain('client_secret=s3cret');
    });

    it('serves the cached token until it is close to expiring', async () => {
      fetchMock.mockResolvedValue(ok('tok-1', 300));
      const svc = new ServiceTokenService();

      await svc.getToken();
      jest.advanceTimersByTime(200_000); // still inside 300s − the 60s safety margin
      await expect(svc.getToken()).resolves.toBe('tok-1');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('re-fetches a margin BEFORE the token actually expires', async () => {
      // The margin exists because a token that is valid when we check can be expired by the time
      // the downstream service validates it. Expiring at 300s, the cache must stop serving at 240s.
      fetchMock.mockResolvedValueOnce(ok('tok-1', 300)).mockResolvedValueOnce(ok('tok-2', 300));
      const svc = new ServiceTokenService();

      await svc.getToken();
      jest.advanceTimersByTime(241_000);
      await expect(svc.getToken()).resolves.toBe('tok-2');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('coalesces concurrent callers on a cold cache into one request', async () => {
      let release: (v: unknown) => void = () => {};
      const gate = new Promise((r) => (release = r));
      fetchMock.mockImplementation(async () => {
        await gate;
        return ok('tok-1');
      });
      const svc = new ServiceTokenService();

      const all = Promise.all([svc.getToken(), svc.getToken(), svc.getToken()]);
      release(undefined);
      await expect(all).resolves.toEqual(['tok-1', 'tok-1', 'tok-1']);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('a failed fetch does not leave the coalescing slot occupied', async () => {
      // If the in-flight promise survived a rejection, every later caller would await a promise
      // that already failed — one unreachable Keycloak would break token issuance for the process.
      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValueOnce(ok('tok-1'));
      const svc = new ServiceTokenService();

      await expect(svc.getToken()).rejects.toThrow('Could not reach Keycloak for a service token');
      await expect(svc.getToken()).resolves.toBe('tok-1');
    });

    it('reports a refusal by status, without echoing the body', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
      await expect(new ServiceTokenService().getToken()).rejects.toThrow(
        'Keycloak refused the service token (401)',
      );
    });
  });

  describe('invalidate', () => {
    it('drops the cache so the next call fetches again', async () => {
      // For a caller that got a 401 and wants one retry with a fresh token, rather than waiting out
      // the remaining lifetime of a token the realm has already stopped accepting.
      fetchMock.mockResolvedValueOnce(ok('tok-1')).mockResolvedValueOnce(ok('tok-2'));
      const svc = new ServiceTokenService();

      await svc.getToken();
      svc.invalidate();
      await expect(svc.getToken()).resolves.toBe('tok-2');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
