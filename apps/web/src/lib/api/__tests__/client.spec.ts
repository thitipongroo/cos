/**
 * Authenticated fetch wrapper — the browser→backend contract.
 *
 * §35.13 ESC-25: apps/web had no unit tests. Two details here are load-bearing and easy to break
 * silently: the Bearer header (the NestJS keycloak-jwt strategy reads nothing else, so a missing
 * header is a blanket 401), and the rule that content-type is set ONLY when a body is sent —
 * Fastify rejects a bodyless request that declares application/json with a 400.
 *
 * `useApi`/`useUpload` are React hooks and need a render host, so they are not exercised here;
 * that is why this file is tested but excluded from the coverage gate (see jest.config.ts).
 */
import { ApiError, apiFetch } from '../client';

const originalFetch = global.fetch;

function mockFetch(response: Partial<Response> & { jsonBody?: unknown }) {
  const fn = jest.fn(async () => ({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: async () => response.jsonBody,
  })) as unknown as typeof fetch;
  global.fetch = fn;
  return fn as unknown as jest.Mock;
}

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('ApiError', () => {
  it('carries the HTTP status and is a real Error', () => {
    const err = new ApiError(404, 'Request failed: 404');
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
    expect(err.name).toBe('ApiError');
    expect(err.message).toBe('Request failed: 404');
  });
});

describe('apiFetch', () => {
  it('returns the parsed JSON body', async () => {
    mockFetch({ jsonBody: { project_id: 'p1' } });
    await expect(apiFetch('/projects/p1', 'tok')).resolves.toEqual({ project_id: 'p1' });
  });

  it('sends the Bearer token', async () => {
    const fetchMock = mockFetch({ jsonBody: {} });
    await apiFetch('/projects', 'tok-123');

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer tok-123');
  });

  it('omits the authorization header when there is no token', async () => {
    const fetchMock = mockFetch({ jsonBody: {} });
    await apiFetch('/health', undefined);

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('authorization')).toBeNull();
  });

  it('sets content-type only when a body is sent', async () => {
    const fetchMock = mockFetch({ jsonBody: {} });
    await apiFetch('/projects', 'tok', { method: 'POST', body: JSON.stringify({ a: 1 }) });

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('does NOT set content-type on a bodyless request', async () => {
    // Fastify 400s a bodyless request that declares application/json.
    const fetchMock = mockFetch({ jsonBody: {} });
    await apiFetch('/notifications/n1/acknowledge', 'tok', { method: 'PATCH' });

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('content-type')).toBeNull();
  });

  it('preserves caller-supplied headers', async () => {
    const fetchMock = mockFetch({ jsonBody: {} });
    await apiFetch('/projects', 'tok', { headers: { 'x-request-id': 'r1' } });

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('x-request-id')).toBe('r1');
    expect(headers.get('authorization')).toBe('Bearer tok');
  });

  it('prefixes the path with the API base', async () => {
    const fetchMock = mockFetch({ jsonBody: {} });
    await apiFetch('/projects', 'tok');
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/projects$/);
  });

  it('throws ApiError with the status on a non-2xx response', async () => {
    mockFetch({ ok: false, status: 403 });
    await expect(apiFetch('/projects', 'tok')).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
    });
  });

  it('returns undefined for 204 without parsing a body', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 204,
      json: async () => {
        throw new Error('204 has no body — json() must not be called');
      },
    })) as unknown as typeof fetch;
    global.fetch = fetchMock;

    await expect(
      apiFetch('/notifications/n1', 'tok', { method: 'DELETE' }),
    ).resolves.toBeUndefined();
  });

  it('forwards the method and body unchanged', async () => {
    const fetchMock = mockFetch({ jsonBody: {} });
    await apiFetch('/projects', 'tok', { method: 'POST', body: '{"name":"P"}' });

    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"name":"P"}');
  });
});
