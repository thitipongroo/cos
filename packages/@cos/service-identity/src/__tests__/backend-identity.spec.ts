// Unit tests — resolveUserIdentity (ADR-107). `fetch` is replaced; the cache, the error mapping and the
// time bound are the real code.

import {
  CACHE_MAX_ENTRIES,
  CACHE_MAX_MS,
  IdentityRejectedError,
  IdentityUnavailableError,
  clearIdentityCache,
  identityCacheSize,
  resolveUserIdentity,
} from '../backend-identity';

const ORIGINAL_URL = process.env['BACKEND_INTERNAL_URL'];
const fetchMock = jest.fn();
const NOW = 1_800_000_000_000; // ms
const clock = () => NOW;
const EXP_FAR = NOW / 1000 + 3600; // token valid another hour

const answer = (status: number, body: unknown) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => {
      if (body instanceof Error) throw body;
      return body;
    },
  }) as unknown as Response;

const GOOD = { tenant_id: 't1', user_id: 'u1', role: 'FINANCE' };

beforeEach(() => {
  clearIdentityCache();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  process.env['BACKEND_INTERNAL_URL'] = 'http://backend:3000/';
});

afterAll(() => {
  if (ORIGINAL_URL === undefined) delete process.env['BACKEND_INTERNAL_URL'];
  else process.env['BACKEND_INTERNAL_URL'] = ORIGINAL_URL;
});

describe('resolveUserIdentity', () => {
  it("asks the backend with the caller's own Authorization header and maps the answer", async () => {
    fetchMock.mockResolvedValue(answer(200, GOOD));
    await expect(resolveUserIdentity('Bearer tok', EXP_FAR, clock)).resolves.toEqual({
      tenantId: 't1',
      userId: 'u1',
      role: 'FINANCE',
    });
    // Trailing slash on the base URL is not doubled.
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:3000/api/v1/auth/identity',
      expect.objectContaining({ headers: { authorization: 'Bearer tok' } }),
    );
  });

  it('uses the real clock when none is given', async () => {
    fetchMock.mockResolvedValue(answer(200, GOOD));
    await expect(resolveUserIdentity('Bearer tok', undefined)).resolves.toMatchObject({
      tenantId: 't1',
    });
  });

  describe('cache', () => {
    it('answers a repeated token from the cache', async () => {
      fetchMock.mockResolvedValue(answer(200, GOOD));
      await resolveUserIdentity('Bearer tok', EXP_FAR, clock);
      await resolveUserIdentity('Bearer tok', EXP_FAR, clock);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('asks again once 30 s have passed, even for a token valid far longer', async () => {
      fetchMock.mockResolvedValue(answer(200, GOOD));
      await resolveUserIdentity('Bearer tok', EXP_FAR, clock);
      await resolveUserIdentity('Bearer tok', EXP_FAR, () => NOW + CACHE_MAX_MS);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("never keeps an answer past the token's own expiry", async () => {
      fetchMock.mockResolvedValue(answer(200, GOOD));
      const exp = NOW / 1000 + 5; // 5 s left
      await resolveUserIdentity('Bearer tok', exp, clock);
      await resolveUserIdentity('Bearer tok', exp, () => NOW + 5_000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not cache a token without exp, or one already expired', async () => {
      fetchMock.mockResolvedValue(answer(200, GOOD));
      await resolveUserIdentity('Bearer a', undefined, clock);
      await resolveUserIdentity('Bearer b', NOW / 1000 - 1, clock);
      expect(identityCacheSize()).toBe(0);
    });

    it('evicts the oldest entry when full', async () => {
      fetchMock.mockResolvedValue(answer(200, GOOD));
      for (let i = 0; i < CACHE_MAX_ENTRIES + 1; i++) {
        await resolveUserIdentity(`Bearer ${i}`, EXP_FAR, clock);
      }
      expect(identityCacheSize()).toBe(CACHE_MAX_ENTRIES);
      fetchMock.mockClear();
      await resolveUserIdentity('Bearer 0', EXP_FAR, clock); // evicted → asked again
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('never caches a refusal', async () => {
      fetchMock.mockResolvedValue(answer(401, {}));
      await expect(resolveUserIdentity('Bearer tok', EXP_FAR, clock)).rejects.toThrow(
        IdentityRejectedError,
      );
      expect(identityCacheSize()).toBe(0);
    });
  });

  describe('refusal is a rejection', () => {
    it.each([401])('backend %i → IdentityRejectedError', async (status) => {
      fetchMock.mockResolvedValue(answer(status, {}));
      await expect(resolveUserIdentity('Bearer tok', EXP_FAR, clock)).rejects.toThrow(
        IdentityRejectedError,
      );
    });
  });

  describe('anything else is unavailable — fail closed', () => {
    it('BACKEND_INTERNAL_URL unset', async () => {
      delete process.env['BACKEND_INTERNAL_URL'];
      await expect(resolveUserIdentity('Bearer tok', EXP_FAR, clock)).rejects.toThrow(
        'BACKEND_INTERNAL_URL is not set',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('network error', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(resolveUserIdentity('Bearer tok', EXP_FAR, clock)).rejects.toThrow(
        new IdentityUnavailableError('ECONNREFUSED'),
      );
    });

    it('a non-Error thrown by fetch', async () => {
      fetchMock.mockRejectedValue('boom');
      await expect(resolveUserIdentity('Bearer tok', EXP_FAR, clock)).rejects.toThrow(
        'backend unreachable',
      );
    });

    // 403 included: not the token's refusal (revision R8) — a WAF or MFA answer is not a verified identity.
    it.each([403, 500, 502, 503, 404])('backend %i', async (status) => {
      fetchMock.mockResolvedValue(answer(status, {}));
      await expect(resolveUserIdentity('Bearer tok', EXP_FAR, clock)).rejects.toThrow(
        IdentityUnavailableError,
      );
    });

    it('a body that is not JSON', async () => {
      fetchMock.mockResolvedValue(answer(200, new SyntaxError('bad json')));
      await expect(resolveUserIdentity('Bearer tok', EXP_FAR, clock)).rejects.toThrow('not JSON');
    });

    it.each([
      ['null body', null],
      ['no tenant_id', { user_id: 'u1', role: 'R' }],
      ['empty tenant_id', { tenant_id: '', user_id: 'u1', role: 'R' }],
      ['no user_id', { tenant_id: 't1', role: 'R' }],
      ['empty user_id', { tenant_id: 't1', user_id: '', role: 'R' }],
      ['no role', { tenant_id: 't1', user_id: 'u1' }],
    ])('%s', async (_label, body) => {
      fetchMock.mockResolvedValue(answer(200, body));
      await expect(resolveUserIdentity('Bearer tok', EXP_FAR, clock)).rejects.toThrow(
        'without tenant_id, user_id and role',
      );
    });
  });
});
