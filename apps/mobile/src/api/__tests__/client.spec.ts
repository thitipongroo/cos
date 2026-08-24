// api/client — the axios instance, its 401-refresh interceptor, and the offline-queue fallback.
//
// This module was outside the coverage gate until 2026-08-19, and it is where the refresh queue
// leaked pending promises: requests that hit a 401 during an in-flight refresh parked a resolver in
// an array that only the SUCCESS path ever drained, so a failed refresh left every one of them
// unsettled — those screens sat in their loading state until the app was restarted.
//
// The transport is stubbed with a custom axios ADAPTER rather than a mocking library, so the
// interceptors under test run exactly as they do in the app and the spec adds no dependency.

const mockEnqueue = jest.fn().mockReturnValue(42);
jest.mock('../../db/sync-queue', () => ({ enqueue: (...a: unknown[]) => mockEnqueue(...a) }));

const authState = {
  accessToken: 'access-1' as string | null,
  refreshToken: 'refresh-1' as string | null,
  // Mirrors the real store: the retried request reads the token back through the request
  // interceptor, so a no-op stub would make a correct retry look like it reused the stale token.
  updateAccessToken: jest.fn(async (token: string) => {
    authState.accessToken = token;
  }),
  updateRefreshToken: jest.fn().mockResolvedValue(undefined),
  logout: jest.fn().mockResolvedValue(undefined),
};
jest.mock('../../store/authStore', () => ({ useAuthStore: { getState: () => authState } }));

import axios from 'axios';
import type { AxiosAdapter, AxiosRequestConfig, AxiosResponse } from 'axios';
import { apiClient, fetchDelta, get, mutate, post, patch, API_BASE_URL } from '../client';
import type { QueuedResult } from '../client';

// ── Transport stubs ─────────────────────────────────────────────────────────────────────────────

type Outcome =
  { kind: 'reply'; status: number; data?: unknown } | { kind: 'network' } | { kind: 'timeout' };

const reply = (status: number, data?: unknown): Outcome => ({ kind: 'reply', status, data });
const NETWORK: Outcome = { kind: 'network' };
const TIMEOUT: Outcome = { kind: 'timeout' };

function axiosError(config: AxiosRequestConfig, code: string, response?: AxiosResponse): Error {
  const err = new Error(code) as Error & {
    isAxiosError: boolean;
    code?: string;
    config: AxiosRequestConfig;
    response?: AxiosResponse;
  };
  err.isAxiosError = true;
  err.config = config;
  if (response) err.response = response;
  else err.code = code;
  return err;
}

/** Turn an outcome into what an adapter must resolve/reject with (axios's own `settle` contract). */
function settle(config: AxiosRequestConfig, outcome: Outcome): Promise<AxiosResponse> {
  if (outcome.kind === 'network') return Promise.reject(axiosError(config, 'ERR_NETWORK'));
  if (outcome.kind === 'timeout') return Promise.reject(axiosError(config, 'ECONNABORTED'));

  const response = {
    data: outcome.data,
    status: outcome.status,
    statusText: '',
    headers: {},
    config,
  } as AxiosResponse;
  return outcome.status >= 200 && outcome.status < 300
    ? Promise.resolve(response)
    : Promise.reject(axiosError(config, `status ${outcome.status}`, response));
}

/** Requests seen by the instance adapter, in order. */
let seen: AxiosRequestConfig[] = [];
/** Queued outcomes per URL; the last one repeats once the queue drains. */
let routes: Map<string, Outcome[]>;
/** Outcomes for the BARE `axios.post` the refresh call uses — a different instance. */
let refreshOutcomes: Outcome[];
let refreshCalls = 0;

const route = (url: string, ...outcomes: Outcome[]) => routes.set(url, outcomes);

const instanceAdapter: AxiosAdapter = (config) => {
  seen.push(config);
  const url = (config.url ?? '').split('?')[0]!;
  const queued = routes.get(url);
  if (!queued || queued.length === 0) {
    return settle(config, reply(200, {}));
  }
  return settle(config, queued.length > 1 ? queued.shift()! : queued[0]!);
};

const bareAdapter: AxiosAdapter = (config) => {
  refreshCalls++;
  const outcome =
    refreshOutcomes.length > 1 ? refreshOutcomes.shift()! : (refreshOutcomes[0] ?? reply(200, {}));
  return settle(config, outcome);
};

const originalInstanceAdapter = apiClient.defaults.adapter;
const originalBareAdapter = axios.defaults.adapter;

beforeEach(() => {
  seen = [];
  routes = new Map();
  refreshOutcomes = [reply(200, { access_token: 'access-2' })];
  refreshCalls = 0;
  mockEnqueue.mockClear();
  authState.accessToken = 'access-1';
  authState.refreshToken = 'refresh-1';
  authState.updateAccessToken.mockClear();
  authState.updateRefreshToken.mockClear();
  authState.logout.mockClear();
  apiClient.defaults.adapter = instanceAdapter;
  axios.defaults.adapter = bareAdapter;
});

afterAll(() => {
  apiClient.defaults.adapter = originalInstanceAdapter;
  axios.defaults.adapter = originalBareAdapter;
});

// ── Tests ───────────────────────────────────────────────────────────────────────────────────────

describe('request interceptor', () => {
  it('attaches the stored access token', async () => {
    await get('/projects');
    expect(seen[0]!.headers!['Authorization']).toBe('Bearer access-1');
  });

  it('sends no Authorization header when there is no session', async () => {
    authState.accessToken = null;
    await get('/projects');
    expect(seen[0]!.headers!['Authorization']).toBeUndefined();
  });
});

describe('helpers', () => {
  it('get passes query params through and returns the body', async () => {
    route('/users', reply(200, [{ id: 'u1' }]));
    await expect(get('/users', { role: 'SITE_WORKER' })).resolves.toEqual([{ id: 'u1' }]);
    expect(seen[0]!.params).toEqual({ role: 'SITE_WORKER' });
  });

  it('post and patch return the body and never enqueue', async () => {
    route('/ai/reports', reply(200, { report: 1 }));
    route('/crm/convert', reply(200, { converted: true }));

    await expect(post('/ai/reports', {})).resolves.toEqual({ report: 1 });
    await expect(patch('/crm/convert', {})).resolves.toEqual({ converted: true });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('post throws rather than queueing when offline', async () => {
    route('/ai/reports', NETWORK);
    await expect(post('/ai/reports', {})).rejects.toThrow();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('fetchDelta encodes the cursor and repeats entity_types[]', async () => {
    route('/sync/delta', reply(200, { updated: [], deleted: [], server_timestamp: 'ts' }));

    await expect(fetchDelta(['task', 'issue'], '2026-06-01T00:00:00Z')).resolves.toEqual({
      updated: [],
      deleted: [],
      server_timestamp: 'ts',
    });
    expect(seen[0]!.url).toContain('since=2026-06-01T00%3A00%3A00Z');
    expect(seen[0]!.url).toContain('entity_types%5B%5D=task');
    expect(seen[0]!.url).toContain('entity_types%5B%5D=issue');
  });

  it('exports the base URL the instance actually uses', () => {
    expect(API_BASE_URL).toBe(apiClient.defaults.baseURL);
  });
});

describe('mutate', () => {
  it('returns the server body on success', async () => {
    route('/site/reports', reply(200, { report_id: 'r1' }));
    await expect(mutate('POST', '/site/reports', {}, 'site_report', 'c-1')).resolves.toEqual({
      report_id: 'r1',
    });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('queues an entity type the push endpoint gained a case for', async () => {
    // delivery joined the offline set on 2026-08-19; the client learns that from @cos/types rather
    // than from a list edited here, so this passes without a change on this side.
    route('/procurement/deliveries', NETWORK);
    await mutate('POST', '/procurement/deliveries', { po_id: 'po-1' }, 'delivery', 'd-1');
    expect(mockEnqueue).toHaveBeenCalledWith('delivery', 'd-1', 'CREATE', { po_id: 'po-1' });
  });

  it('queues a POST as CREATE when the network is unreachable', async () => {
    route('/site/reports', NETWORK);
    const result = (await mutate(
      'POST',
      '/site/reports',
      { a: 1 },
      'site_report',
      'c-1',
    )) as QueuedResult;

    expect(mockEnqueue).toHaveBeenCalledWith('site_report', 'c-1', 'CREATE', { a: 1 });
    expect(result).toEqual({ queued: true, queueId: 42, afterTimeout: false });
  });

  it('queues a PATCH as UPDATE', async () => {
    route('/tasks/t1', NETWORK);
    await mutate('PATCH', '/tasks/t1', { progress_percent: 100 }, 'task', 't1');
    expect(mockEnqueue).toHaveBeenCalledWith('task', 't1', 'UPDATE', { progress_percent: 100 });
  });

  it('reports a timeout separately, while still queuing', async () => {
    // The platform's stated delivery contract is at-least-once ("never skip"), so losing a safety
    // record to a slow link is the worse outcome — but the caller is told, because this is the one
    // failure where the server may already have applied the write.
    route('/safety/incidents', TIMEOUT);
    const result = (await mutate('POST', '/safety/incidents', {}, 'safety', 'i-1')) as QueuedResult;

    expect(result.afterTimeout).toBe(true);
    expect(mockEnqueue).toHaveBeenCalled();
  });

  it('never smuggles a marker field into the payload', async () => {
    // The payload is forwarded verbatim to /sync/push → the domain DTO, and those are validated with
    // `forbidNonWhitelisted` — an added field would be rejected by the very replay it annotates.
    route('/safety/incidents', TIMEOUT);
    await mutate('POST', '/safety/incidents', { project_id: 'p1' }, 'safety', 'i-1');
    expect(mockEnqueue).toHaveBeenCalledWith('safety', 'i-1', 'CREATE', { project_id: 'p1' });
  });

  it('throws rather than queueing an entity type /sync/push cannot replay', async () => {
    // The server's push switch throws BadRequestException for anything outside its case list. Queuing
    // one told the user "saved, will sync" about a row destined for a 400 and a silent discard.
    // `tenant-settings` and `conflict` are the remaining non-pushable types: §17.4 puts config and
    // permission changes in the online-required set, and resolving a conflict is a decision taken
    // against the server state the reviewer is looking at.
    route('/tenant/settings', NETWORK);

    await expect(
      mutate('PATCH', '/tenant/settings', {}, 'tenant-settings', 'me'),
    ).rejects.toThrow();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('rethrows a server error instead of queueing it', async () => {
    route('/site/reports', reply(422, { error: { code: 'COS-SITE-001' } }));
    await expect(mutate('POST', '/site/reports', {}, 'site_report', 'c-1')).rejects.toThrow();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

describe('401 → silent refresh', () => {
  it('refreshes once, retries the original request, and persists both tokens', async () => {
    refreshOutcomes = [reply(200, { access_token: 'access-2', refresh_token: 'refresh-2' })];
    route('/users/me', reply(401), reply(200, { id: 'u1' }));

    await expect(get('/users/me')).resolves.toEqual({ id: 'u1' });
    expect(authState.updateAccessToken).toHaveBeenCalledWith('access-2');
    // Keycloak rotates refresh tokens (revokeRefreshToken=true) — not storing the new one breaks the
    // NEXT refresh.
    expect(authState.updateRefreshToken).toHaveBeenCalledWith('refresh-2');
    expect(seen[seen.length - 1]!.headers!['Authorization']).toBe('Bearer access-2');
  });

  it('does not persist a refresh token the server did not rotate', async () => {
    route('/users/me', reply(401), reply(200, {}));
    await get('/users/me');
    expect(authState.updateRefreshToken).not.toHaveBeenCalled();
  });

  it('retries only once — a second 401 is surfaced', async () => {
    route('/users/me', reply(401));
    await expect(get('/users/me')).rejects.toThrow();
    expect(refreshCalls).toBe(1);
  });

  it('passes a non-401 straight through without refreshing', async () => {
    route('/users/me', reply(500));
    await expect(get('/users/me')).rejects.toThrow();
    expect(refreshCalls).toBe(0);
    expect(authState.updateAccessToken).not.toHaveBeenCalled();
  });

  it('logs out when there is no refresh token to use', async () => {
    authState.refreshToken = null;
    route('/users/me', reply(401));

    await expect(get('/users/me')).rejects.toThrow();
    expect(refreshCalls).toBe(0);
    expect(authState.logout).toHaveBeenCalled();
  });

  it('logs out when the refresh itself fails', async () => {
    refreshOutcomes = [reply(400, { error: 'invalid_grant' })];
    route('/users/me', reply(401));

    await expect(get('/users/me')).rejects.toThrow();
    expect(authState.logout).toHaveBeenCalled();
  });

  // THE LEAK. Concurrent 401s park a resolver and wait for the refresh; only the success path used
  // to drain that queue.
  describe('concurrent 401s', () => {
    it('refreshes once and replays every waiting request', async () => {
      route('/a', reply(401), reply(200, { r: 'a' }));
      route('/b', reply(401), reply(200, { r: 'b' }));
      route('/c', reply(401), reply(200, { r: 'c' }));

      const results = await Promise.all([get('/a'), get('/b'), get('/c')]);

      expect(results).toEqual([{ r: 'a' }, { r: 'b' }, { r: 'c' }]);
      expect(refreshCalls).toBe(1);
    });

    it('SETTLES the waiting requests when the refresh fails, instead of hanging them forever', async () => {
      refreshOutcomes = [reply(400, {})];
      route('/a', reply(401));
      route('/b', reply(401));
      route('/c', reply(401));

      const settled = await Promise.allSettled([get('/a'), get('/b'), get('/c')]);

      // Before the fix the second and third never settled at all — the screens behind them stayed in
      // their loading state until the app was restarted.
      expect(settled.map((s) => s.status)).toEqual(['rejected', 'rejected', 'rejected']);
      expect(authState.logout).toHaveBeenCalled();
    });

    it('settles the waiting requests when there is no refresh token at all', async () => {
      authState.refreshToken = null;
      route('/a', reply(401));
      route('/b', reply(401));

      const settled = await Promise.allSettled([get('/a'), get('/b')]);
      expect(settled.map((s) => s.status)).toEqual(['rejected', 'rejected']);
    });

    it('leaves no orphan waiters behind for a later refresh to replay', async () => {
      refreshOutcomes = [reply(400, {})];
      route('/a', reply(401));
      route('/b', reply(401));
      await Promise.allSettled([get('/a'), get('/b')]);

      // A second, successful cycle must send exactly one retry — not three, which is what resolving
      // the first cycle's orphaned waiters would produce.
      seen = [];
      refreshOutcomes = [reply(200, { access_token: 'access-9' })];
      route('/d', reply(401), reply(200, { ok: true }));

      await expect(get('/d')).resolves.toEqual({ ok: true });
      expect(seen.filter((c) => (c.url ?? '').startsWith('/d'))).toHaveLength(2);
    });
  });
});
