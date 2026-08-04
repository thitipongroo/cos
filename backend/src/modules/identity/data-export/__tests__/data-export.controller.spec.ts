// Data-export controller unit tests (ADR-078).
//
// The controller is thin, so these assert the parts that would be a security or compliance bug if
// they drifted:
//   - every route scopes by the JWT's OWN tenant/user, never a value from the body or a path param
//   - the date bounds are converted, and an ABSENT bound stays absent rather than becoming the epoch
//   - all three routes — including the download — carry the kill switch

import 'reflect-metadata';
import { DataExportController } from '../data-export.controller';
import { FEATURE_FLAG_KEY } from '../../../../shared/feature-flags/feature-flag.decorator';
import type { DataExportService } from '../data-export.service';
import type { TenantRequest } from '../../../tenant/tenant.middleware';

const TENANT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const EXPORT = '33333333-3333-4333-8333-333333333333';

const req = { tenantId: TENANT, userId: USER } as unknown as TenantRequest;

const BODY = {
  categories: ['identity' as const],
  format: 'JSON' as const,
  action_token: 'tok',
};

describe('DataExportController', () => {
  let service: jest.Mocked<Pick<DataExportService, 'request' | 'list' | 'downloadUrl'>>;
  let controller: DataExportController;

  beforeEach(() => {
    service = {
      request: jest.fn(),
      list: jest.fn(),
      downloadUrl: jest.fn(),
    } as unknown as jest.Mocked<Pick<DataExportService, 'request' | 'list' | 'downloadUrl'>>;
    controller = new DataExportController(service as unknown as DataExportService);
  });

  it('POST requests against the JWT identity, not anything in the body', async () => {
    service.request.mockResolvedValue({ exportId: EXPORT } as never);
    await controller.request(req, BODY);

    expect(service.request).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, userId: USER, actionToken: 'tok' }),
    );
  });

  it('converts the window to Dates and leaves an absent bound absent', async () => {
    // `null`, not `new Date(undefined)`: an omitted bound means "no bound", and coercing it would
    // silently window the export to the epoch and return nothing.
    service.request.mockResolvedValue({} as never);
    await controller.request(req, { ...BODY, from_date: '2026-01-01' });

    const [params] = service.request.mock.calls[0] as [
      { fromDate: Date | null; toDate: Date | null },
    ];
    expect(params.fromDate).toEqual(new Date('2026-01-01'));
    expect(params.toDate).toBeNull();
  });

  it('passes both bounds through when both are given', async () => {
    service.request.mockResolvedValue({} as never);
    await controller.request(req, { ...BODY, from_date: '2026-01-01', to_date: '2026-06-30' });

    const [params] = service.request.mock.calls[0] as [
      { fromDate: Date | null; toDate: Date | null },
    ];
    expect(params.fromDate).toEqual(new Date('2026-01-01'));
    expect(params.toDate).toEqual(new Date('2026-06-30'));
  });

  it('GET lists only the caller’s own requests', async () => {
    const rows = [{ exportId: EXPORT }];
    service.list.mockResolvedValue(rows as never);
    await expect(controller.list(req)).resolves.toBe(rows);
    expect(service.list).toHaveBeenCalledWith(TENANT, USER);
  });

  it('GET download scopes the lookup to the caller, not to the path param alone', async () => {
    // The export id comes from the URL; the identity never does. Without the JWT user in the
    // predicate, guessing an id would hand someone another person's archive.
    const link = { url: 'https://minio/signed', expiresInSeconds: 3600 };
    service.downloadUrl.mockResolvedValue(link);
    await expect(controller.download(req, EXPORT)).resolves.toBe(link);
    expect(service.downloadUrl).toHaveBeenCalledWith(TENANT, USER, EXPORT);
  });

  describe('kill switch (QM-15 / ADR-049)', () => {
    // The download is gated too. The incident this switch exists for is "the export is producing
    // wrong data" — a bad join putting one person's rows in another's archive — and in that incident
    // the archives already in MinIO are exactly what must stop being handed out.
    it.each(['request', 'list', 'download'] as const)('%s carries s1.identity.data-export', (m) => {
      const flag = Reflect.getMetadata(
        FEATURE_FLAG_KEY,
        DataExportController.prototype[m],
      ) as string;
      expect(flag).toBe('s1.identity.data-export');
    });
  });
});
