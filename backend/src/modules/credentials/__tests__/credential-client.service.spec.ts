import { HttpException, HttpStatus } from '@nestjs/common';
import { ClsServiceManager } from 'nestjs-cls';
import { CredentialClientService, type IssueCredentialRequest } from '../credential-client.service';
import { CLS_TENANT_ID, CLS_USER_ID, CLS_USER_ROLE } from '../../../shared/context/cls-context';

// OQ-46 — every internal call now carries the backend's own client-credentials token alongside
// the identity headers. The tests do not exercise Keycloak; they only need the client to be
// constructible and to produce an Authorization header.
function serviceTokenDouble() {
  return { getToken: jest.fn().mockResolvedValue('service-token'), invalidate: jest.fn() } as never;
}

/** Run fn inside an active CLS context with the given store (null = active but empty). */
function inCls<T>(store: Record<string, string> | null, fn: () => T | Promise<T>): Promise<T> {
  const cls = ClsServiceManager.getClsService();
  return cls.run(async () => {
    if (store) for (const [k, v] of Object.entries(store)) cls.set(k, v);
    return fn();
  });
}

const ADMIN_CTX = {
  [CLS_TENANT_ID]: 'tenant-1',
  [CLS_USER_ID]: 'user-1',
  [CLS_USER_ROLE]: 'TENANT_ADMIN',
};

function mockFetchOnce(impl: unknown): jest.Mock {
  const fn = jest.fn().mockResolvedValue(impl) as unknown as jest.Mock;
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('CredentialClientService', () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env['CREDENTIAL_SERVICE_URL'];
  let service: CredentialClientService;

  beforeEach(() => {
    process.env['CREDENTIAL_SERVICE_URL'] = 'http://credential-service:3009';
    service = new CredentialClientService(serviceTokenDouble());
  });
  afterEach(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env['CREDENTIAL_SERVICE_URL'];
    else process.env['CREDENTIAL_SERVICE_URL'] = originalUrl;
    jest.clearAllMocks();
  });

  it('issues a VC, forwarding the CLS identity as x-* headers', async () => {
    const credential = { id: 'urn:uuid:vc', type: ['VerifiableCredential', 'LicenceVC'] };
    const fetchMock = mockFetchOnce({ ok: true, json: async () => ({ vcId: 'vc-1', credential }) });

    const req: IssueCredentialRequest = {
      credentialType: 'LICENCE',
      subjectId: 'did:key:z6Mkworker',
      claims: { licenceNumber: 'L-1' },
    };
    const result = await inCls(ADMIN_CTX, () => service.issue(req));

    expect(result).toEqual({ vcId: 'vc-1', credential });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://credential-service:3009/credentials/issue');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'content-type': 'application/json',
      'x-tenant-id': 'tenant-1',
      'x-user-id': 'user-1',
      'x-user-role': 'TENANT_ADMIN',
    });
    expect(JSON.parse(init.body as string)).toEqual(req);
  });

  it('verifies a VC (wraps it as { credential })', async () => {
    const fetchMock = mockFetchOnce({ ok: true, json: async () => ({ verified: true }) });
    const vc = { id: 'urn:uuid:vc' };
    const result = await inCls(ADMIN_CTX, () => service.verify(vc));

    expect(result).toEqual({ verified: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://credential-service:3009/credentials/verify');
    expect(JSON.parse(init.body as string)).toEqual({ credential: vc });
  });

  it('revokes a VC, url-encoding the vcId', async () => {
    const fetchMock = mockFetchOnce({ ok: true, json: async () => ({ revoked: true }) });
    const result = await inCls(ADMIN_CTX, () => service.revoke('vc/1 a'));

    expect(result).toEqual({ revoked: true });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('http://credential-service:3009/credentials/vc%2F1%20a/revoke');
  });

  it('falls back to the internal default URL when the env var is unset', async () => {
    delete process.env['CREDENTIAL_SERVICE_URL'];
    const svc = new CredentialClientService(serviceTokenDouble());
    const fetchMock = mockFetchOnce({ ok: true, json: async () => ({ verified: false }) });
    await inCls(ADMIN_CTX, () => svc.verify({}));
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('http://credential-service:3009/credentials/verify');
  });

  it('fails closed with 401 when there is no tenant context', async () => {
    const fetchMock = mockFetchOnce({ ok: true, json: async () => ({}) });
    // No CLS context → clsTenantId() === ''
    await expect(service.verify({})).rejects.toMatchObject({ status: HttpStatus.UNAUTHORIZED });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a transport failure to 502 Bad Gateway', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    await expect(inCls(ADMIN_CTX, () => service.verify({}))).rejects.toMatchObject({
      status: HttpStatus.BAD_GATEWAY,
    });
  });

  it('passes a 4xx from the service straight through (e.g. 403 non-admin)', async () => {
    mockFetchOnce({ ok: false, status: 403, text: async () => 'FORBIDDEN' });
    const err = await inCls(ADMIN_CTX, () =>
      service.issue({ credentialType: 'LICENCE', subjectId: 'x' }),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
  });

  it('maps a 5xx to 502, tolerating a body that cannot be read', async () => {
    mockFetchOnce({
      ok: false,
      status: 500,
      text: async () => {
        throw new Error('stream error');
      },
    });
    await expect(inCls(ADMIN_CTX, () => service.verify({}))).rejects.toMatchObject({
      status: HttpStatus.BAD_GATEWAY,
    });
  });
});
