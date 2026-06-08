import { DeltaSyncClient } from '../DeltaSyncClient';
import type { DeltaResponse } from '../DeltaSyncClient';

const mockResponse: DeltaResponse = {
  updated: [{ id: 'abc', title: 'updated' }],
  deleted: ['del-1'],
  server_timestamp: '2026-06-08T00:00:00.000Z',
};

const makeClient = (token: string | null = 'test-token') => {
  const mockAxios = {
    get: jest.fn().mockResolvedValue({ data: mockResponse }),
  } as unknown as import('axios').AxiosInstance;
  const client = new DeltaSyncClient(mockAxios, () => token);
  return { client, mockAxios };
};

describe('DeltaSyncClient', () => {
  describe('fetchDelta', () => {
    it('calls GET /api/v1/sync/delta and returns DeltaResponse', async () => {
      const { client, mockAxios } = makeClient();
      const result = await client.fetchDelta('2026-01-01T00:00:00Z', ['local_site_reports']);
      expect(mockAxios.get).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResponse);
    });

    it('includes Authorization header when token is available', async () => {
      const { client, mockAxios } = makeClient('my-token');
      await client.fetchDelta('2026-01-01T00:00:00Z', ['local_issues']);
      const [, config] = (mockAxios.get as jest.Mock).mock.calls[0] as [
        string,
        { headers: Record<string, string> },
      ];
      expect(config.headers['Authorization']).toBe('Bearer my-token');
    });

    it('omits Authorization header when token is null', async () => {
      const { client, mockAxios } = makeClient(null);
      await client.fetchDelta('2026-01-01T00:00:00Z', ['local_issues']);
      const [, config] = (mockAxios.get as jest.Mock).mock.calls[0] as [
        string,
        { headers: Record<string, string> },
      ];
      expect(config.headers['Authorization']).toBeUndefined();
    });

    it('encodes since and entity_types as query parameters', async () => {
      const { client, mockAxios } = makeClient();
      await client.fetchDelta('2026-06-01T00:00:00Z', ['local_site_reports', 'local_issues']);
      const [url] = (mockAxios.get as jest.Mock).mock.calls[0] as [string];
      expect(url).toContain('since=2026-06-01T00%3A00%3A00Z');
      expect(url).toContain('entity_types%5B%5D=local_site_reports');
      expect(url).toContain('entity_types%5B%5D=local_issues');
    });
  });
});
