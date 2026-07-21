import { HttpException, HttpStatus } from '@nestjs/common';
import { ClsServiceManager } from 'nestjs-cls';
import { FileServiceClient } from '../file-service-client.service';
import { CLS_TENANT_ID, CLS_USER_ID, CLS_USER_ROLE } from '../../../shared/context/cls-context';

function inCls<T>(store: Record<string, string> | null, fn: () => T | Promise<T>): Promise<T> {
  const cls = ClsServiceManager.getClsService();
  return cls.run(async () => {
    if (store) for (const [k, v] of Object.entries(store)) cls.set(k, v);
    return fn();
  });
}

const CTX = {
  [CLS_TENANT_ID]: 'tenant-1',
  [CLS_USER_ID]: 'user-1',
  [CLS_USER_ROLE]: 'PROJECT_MANAGER',
};

function mockFetch(impl: unknown): jest.Mock {
  const fn = jest.fn().mockResolvedValue(impl) as unknown as jest.Mock;
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

const META = {
  file_id: 'file-1',
  original_filename: 'contract.pdf',
  mime_type: 'application/pdf',
  file_size_bytes: '2048',
  file_status: 'CLEAN',
  uploaded_by: 'user-1',
  uploaded_at: '2026-07-21T00:00:00.000Z',
  deleted_at: null,
  sha256: 'c'.repeat(64),
};

describe('FileServiceClient', () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env['FILE_SERVICE_URL'];
  let service: FileServiceClient;

  beforeEach(() => {
    process.env['FILE_SERVICE_URL'] = 'http://file-service:3002';
    service = new FileServiceClient();
  });
  afterEach(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env['FILE_SERVICE_URL'];
    else process.env['FILE_SERVICE_URL'] = originalUrl;
    jest.clearAllMocks();
  });

  it('fetches metadata, forwarding the CLS identity headers', async () => {
    const fetchMock = mockFetch({ ok: true, status: 200, json: async () => META });
    const result = await inCls(CTX, () => service.getFileMetadata('file-1'));

    expect(result).toEqual(META);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://file-service:3002/api/v1/files/file-1');
    expect(init.method).toBe('GET');
    expect(init.headers).toMatchObject({
      'x-tenant-id': 'tenant-1',
      'x-user-id': 'user-1',
      'x-user-role': 'PROJECT_MANAGER',
    });
  });

  it('falls back to the internal default URL when the env var is unset', async () => {
    delete process.env['FILE_SERVICE_URL'];
    const svc = new FileServiceClient();
    const fetchMock = mockFetch({ ok: true, status: 200, json: async () => META });
    await inCls(CTX, () => svc.getFileMetadata('file-1'));
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      'http://file-service:3002/api/v1/files/file-1',
    );
  });

  it('returns null when the file does not exist for the tenant (404)', async () => {
    mockFetch({ ok: false, status: 404, text: async () => 'FILE_NOT_FOUND' });
    await expect(inCls(CTX, () => service.getFileMetadata('missing'))).resolves.toBeNull();
  });

  it('fails closed with 401 when there is no tenant context', async () => {
    const fetchMock = mockFetch({ ok: true, status: 200, json: async () => META });
    await expect(service.getFileMetadata('file-1')).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a transport failure to 502 Bad Gateway', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    await expect(inCls(CTX, () => service.getFileMetadata('file-1'))).rejects.toMatchObject({
      status: HttpStatus.BAD_GATEWAY,
    });
  });

  it('passes a 4xx straight through (e.g. 403)', async () => {
    mockFetch({ ok: false, status: 403, text: async () => 'FORBIDDEN' });
    const err = await inCls(CTX, () => service.getFileMetadata('file-1')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
  });

  it('maps a 5xx to 502, tolerating an unreadable body', async () => {
    mockFetch({
      ok: false,
      status: 500,
      text: async () => {
        throw new Error('stream error');
      },
    });
    await expect(inCls(CTX, () => service.getFileMetadata('file-1'))).rejects.toMatchObject({
      status: HttpStatus.BAD_GATEWAY,
    });
  });

  describe('upload', () => {
    const params = {
      buffer: Buffer.from('%PDF-1.7 test'),
      filename: 'contract-con-1.pdf',
      contentType: 'application/pdf',
      entityType: 'contract',
      entityId: 'con-1',
    };

    it('uploads multipart with entity query + identity headers, returns file_id', async () => {
      const fetchMock = mockFetch({
        ok: true,
        status: 201,
        json: async () => ({ file_id: 'file-9' }),
      });
      const result = await inCls(CTX, () => service.upload(params));

      expect(result).toEqual({ file_id: 'file-9' });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        'http://file-service:3002/api/v1/files/upload?entity_type=contract&entity_id=con-1',
      );
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({ 'x-tenant-id': 'tenant-1' });
      expect(init.body).toBeInstanceOf(FormData);
    });

    it('omits the entity query when entityType/entityId are not given', async () => {
      const fetchMock = mockFetch({
        ok: true,
        status: 201,
        json: async () => ({ file_id: 'file-9' }),
      });
      await inCls(CTX, () =>
        service.upload({
          buffer: params.buffer,
          filename: params.filename,
          contentType: params.contentType,
        }),
      );
      expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
        'http://file-service:3002/api/v1/files/upload',
      );
    });

    it('fails closed with 401 when there is no tenant context', async () => {
      const fetchMock = mockFetch({ ok: true, status: 201, json: async () => ({ file_id: 'x' }) });
      await expect(service.upload(params)).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('maps a transport failure to 502', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
      await expect(inCls(CTX, () => service.upload(params))).rejects.toMatchObject({
        status: HttpStatus.BAD_GATEWAY,
      });
    });

    it('passes a 4xx through and maps a 5xx (unreadable body) to 502', async () => {
      mockFetch({ ok: false, status: 422, text: async () => 'MIME_TYPE_NOT_ALLOWED' });
      await expect(inCls(CTX, () => service.upload(params))).rejects.toMatchObject({ status: 422 });

      mockFetch({
        ok: false,
        status: 503,
        text: async () => {
          throw new Error('stream error');
        },
      });
      await expect(inCls(CTX, () => service.upload(params))).rejects.toMatchObject({
        status: HttpStatus.BAD_GATEWAY,
      });
    });
  });
});
