// The request side of the PDPA export (ADR-078).
//
// The behaviours worth protecting are the ones a regression would break the LEGAL position on, or
// would break silently:
//   - the action token is spent BEFORE any row is written (the other order writes an unauthorised
//     export request and leaves the token live to try elsewhere)
//   - an inverted window is refused, never run — it returns an EMPTY archive, which reads to the
//     subject as "you hold nothing about me": a complete-looking, wrong answer
//   - every download failure is distinguishable, because "download failed" does not tell a person
//     whether to wait, re-request, or complain
//   - a fresh signed URL per click, never a long-lived bearer link to a RESTRICTED payload
//   - the Temporal connection is opened once and closed (ADR-034 / Rule 39)

const prismaMock = {
  $transaction: jest.fn(),
  $disconnect: jest.fn().mockResolvedValue(undefined),
};

const connectionMock = { close: jest.fn().mockResolvedValue(undefined) };
const workflowStart = jest.fn().mockResolvedValue(undefined);
const connectMock = jest.fn().mockResolvedValue(connectionMock);

jest.mock('../../../../shared/prisma/create-prisma-client', () => ({
  createPrismaClient: () => prismaMock,
}));
jest.mock('../../../../shared/prisma/app-database-url', () => ({
  appDatabaseUrl: () => 'postgresql://app_user@pgbouncer:6432/cos',
}));
jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('@temporalio/client', () => ({
  Connection: { connect: (...args: unknown[]) => connectMock(...args) },
  Client: class {
    workflow = { start: workflowStart };
  },
}));

import { ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import { DataExportService, isDownloadable } from '../data-export.service';
import type { StepUpService } from '../../step-up/step-up.service';
import type { FileServiceClient } from '../../../files/file-service-client.service';

const TENANT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const EXPORT = '33333333-3333-4333-8333-333333333333';
const FILE = '44444444-4444-4444-8444-444444444444';

const FUTURE = new Date(Date.now() + 86_400_000);
const PAST = new Date(Date.now() - 86_400_000);

function row(over: Record<string, unknown> = {}) {
  return {
    export_id: EXPORT,
    categories: ['identity'],
    format: 'JSON',
    from_date: null,
    to_date: null,
    status: 'READY',
    file_id: FILE,
    failure_reason: null,
    requested_at: new Date('2026-08-04T10:00:00.000Z'),
    completed_at: new Date('2026-08-04T10:01:00.000Z'),
    expires_at: FUTURE,
    ...over,
  };
}

/**
 * Build the service with a tx double that answers $queryRaw from `results` in order and records the
 * interpolated values, so a test can assert WHICH id a statement was scoped to.
 */
function makeService(results: unknown[][] = []) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const setLocal = jest.fn().mockResolvedValue(0);
  let i = 0;

  prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      $executeRawUnsafe: setLocal,
      $queryRaw: jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
        calls.push({ sql: strings.join('?'), values });
        return Promise.resolve(results[i++] ?? []);
      }),
    }),
  );

  const stepUp = { consume: jest.fn().mockResolvedValue(true) } as unknown as StepUpService;
  const files = { getSignedUrl: jest.fn() } as unknown as FileServiceClient;
  const service = new DataExportService(stepUp, files);
  return { service, stepUp, files, calls, setLocal };
}

const REQUEST = {
  tenantId: TENANT,
  userId: USER,
  actionToken: 'tok',
  categories: ['identity' as const],
  format: 'JSON' as const,
};

beforeEach(() => jest.clearAllMocks());

describe('isDownloadable', () => {
  it('is true only for a READY request with a file that has not aged out', () => {
    expect(isDownloadable({ status: 'READY', file_id: FILE, expires_at: FUTURE })).toBe(true);
    expect(isDownloadable({ status: 'PENDING', file_id: FILE, expires_at: FUTURE })).toBe(false);
    // READY with no file is the window between the row flipping and the upload landing.
    expect(isDownloadable({ status: 'READY', file_id: null, expires_at: FUTURE })).toBe(false);
    expect(isDownloadable({ status: 'READY', file_id: FILE, expires_at: PAST })).toBe(false);
  });
});

describe('request', () => {
  it('spends the action token before writing the row, and only then queues the job', async () => {
    const order: string[] = [];
    const { service, stepUp, calls } = makeService([[row({ status: 'PENDING', file_id: null })]]);
    (stepUp.consume as jest.Mock).mockImplementation(() => {
      order.push('consume');
      return Promise.resolve(true);
    });
    workflowStart.mockImplementation(() => {
      order.push('start');
      return Promise.resolve();
    });

    await service.request(REQUEST);

    expect(order).toEqual(['consume', 'start']);
    expect(stepUp.consume).toHaveBeenCalledWith('tok', USER, 'data-export');
    expect(calls[0]!.sql).toContain('INSERT INTO platform.export_requests');
  });

  it('refuses and writes NOTHING when the token is spent, expired, or another user’s', async () => {
    // A row written before the token is checked is an unauthorised export request already queued to
    // gather every coordinate the person was recorded at — with the token still live to try elsewhere.
    const { service, stepUp, calls } = makeService();
    (stepUp.consume as jest.Mock).mockResolvedValue(false);

    await expect(service.request(REQUEST)).rejects.toBeInstanceOf(ForbiddenException);
    expect(calls).toHaveLength(0);
    expect(workflowStart).not.toHaveBeenCalled();
  });

  it('rejects an inverted window instead of returning an empty export', async () => {
    const { service, calls } = makeService();
    await expect(
      service.request({
        ...REQUEST,
        fromDate: new Date('2026-06-30'),
        toDate: new Date('2026-01-01'),
      }),
    ).rejects.toMatchObject({ status: 422, response: { error: { code: 'COS-PDPA-003' } } });
    expect(calls).toHaveLength(0);
  });

  it('accepts a window with either bound open, and passes both through', async () => {
    // "Everything up to a date" is as valid a request as "everything from a date".
    const { service, calls } = makeService([[row({ status: 'PENDING', file_id: null })]]);
    const from = new Date('2026-01-01');
    await service.request({ ...REQUEST, fromDate: from });
    expect(calls[0]!.values).toContain(from);
    expect(calls[0]!.values).toContain(null);

    const { service: s2, calls: c2 } = makeService([[row({ status: 'PENDING', file_id: null })]]);
    const to = new Date('2026-06-30');
    await s2.request({ ...REQUEST, toDate: to });
    expect(c2[0]!.values).toContain(to);
  });

  it('scopes the tenant with SET LOCAL inside the same transaction as the insert', async () => {
    // Transaction-scoped, so PgBouncer cannot leak the setting into another tenant's request (QM-18).
    const { service, setLocal } = makeService([[row({ status: 'PENDING', file_id: null })]]);
    await service.request(REQUEST);
    expect(setLocal).toHaveBeenCalledWith(`SET LOCAL app.current_tenant_id = '${TENANT}'`);
  });

  it('derives the workflow id from the export id so a retried start is a duplicate', async () => {
    // Not random: a second job would gather the same person's data twice and upload two archives.
    const { service } = makeService([[row({ status: 'PENDING', file_id: null })]]);
    await service.request(REQUEST);

    expect(workflowStart).toHaveBeenCalledWith('dataExportWorkflow', {
      taskQueue: 'data-export',
      workflowId: `data-export-${EXPORT}`,
      args: [{ export_id: EXPORT, tenant_id: TENANT, user_id: USER }],
    });
  });

  it('opens ONE Temporal connection and reuses it across requests', async () => {
    // ProcurementService opens a fresh Connection per workflow start and never closes it — a gRPC
    // channel leaked per call. Not repeated here (ADR-034 / Rule 39).
    const { service } = makeService([
      [row({ status: 'PENDING', file_id: null })],
      [row({ status: 'PENDING', file_id: null })],
    ]);
    await service.request(REQUEST);
    await service.request(REQUEST);

    expect(workflowStart).toHaveBeenCalledTimes(2);
    expect(connectMock).toHaveBeenCalledTimes(1);
  });

  it('reports downloadable=false for the request it just created', async () => {
    const { service } = makeService([[row({ status: 'PENDING', file_id: null })]]);
    const view = await service.request(REQUEST);
    expect(view.status).toBe('PENDING');
    expect(view.downloadable).toBe(false);
  });

  it('rejects a tenant id that is not a UUID before any SQL runs', async () => {
    // SET LOCAL is string-interpolated — it cannot be parameterised — so this guard is the injection
    // boundary, not a formality.
    const { service, calls } = makeService();
    await expect(service.request({ ...REQUEST, tenantId: "'; DROP TABLE--" })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe('list', () => {
  it('returns the caller’s own requests, scoped by user_id on top of RLS', async () => {
    // RLS confines the query to the tenant; within a tenant, one employee's export requests are not
    // another employee's business.
    const { service, calls } = makeService([[row(), row({ status: 'FAILED', file_id: null })]]);
    const out = await service.list(TENANT, USER);

    expect(out).toHaveLength(2);
    expect(out[0]!.downloadable).toBe(true);
    expect(out[1]!.downloadable).toBe(false);
    expect(calls[0]!.sql).toContain('WHERE user_id');
    expect(calls[0]!.values).toContain(USER);
    expect(calls[0]!.sql).toContain('ORDER BY requested_at DESC');
  });

  it('maps every column onto the view', async () => {
    const from = new Date('2026-01-01');
    const { service } = makeService([[row({ from_date: from, failure_reason: 'x' })]]);
    const [view] = await service.list(TENANT, USER);
    expect(view).toMatchObject({
      exportId: EXPORT,
      categories: ['identity'],
      format: 'JSON',
      fromDate: from,
      toDate: null,
      status: 'READY',
      failureReason: 'x',
    });
  });

  it('rejects a non-UUID tenant before any SQL runs', async () => {
    const { service, calls } = makeService();
    await expect(service.list("'; DROP TABLE--", USER)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe('downloadUrl', () => {
  it('mints a fresh signed URL and passes File Service’s own TTL through', async () => {
    // A new link per click — never a week-long bearer URL for a payload holding every coordinate the
    // person was recorded at (ADR-078). The TTL is File Service's config, not a constant here.
    const { service, files } = makeService([[row()]]);
    (files.getSignedUrl as jest.Mock).mockResolvedValue({
      url: 'https://minio/signed',
      expires_in_seconds: 3600,
    });

    await expect(service.downloadUrl(TENANT, USER, EXPORT)).resolves.toEqual({
      url: 'https://minio/signed',
      expiresInSeconds: 3600,
    });
    expect(files.getSignedUrl).toHaveBeenCalledWith(FILE);
  });

  it('404s for an export that is not the caller’s', async () => {
    const { service, calls } = makeService([[]]);
    await expect(service.downloadUrl(TENANT, USER, EXPORT)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(calls[0]!.values).toContain(USER);
  });

  it('says "still being prepared" while the job runs, not "failed"', async () => {
    const { service } = makeService([[row({ status: 'PROCESSING', file_id: null })]]);
    await expect(service.downloadUrl(TENANT, USER, EXPORT)).rejects.toMatchObject({
      status: 422,
      response: { error: { code: 'COS-PDPA-005', details: { status: 'PROCESSING' } } },
    });
  });

  it('surfaces the recorded failure reason when the job failed', async () => {
    const { service } = makeService([
      [row({ status: 'FAILED', file_id: null, failure_reason: 'Upload rejected' })],
    ]);
    await expect(service.downloadUrl(TENANT, USER, EXPORT)).rejects.toMatchObject({
      response: { error: { message: 'Upload rejected' } },
    });
  });

  it('falls back to a generic message when a FAILED row recorded no reason', async () => {
    const { service } = makeService([[row({ status: 'FAILED', file_id: null })]]);
    await expect(service.downloadUrl(TENANT, USER, EXPORT)).rejects.toMatchObject({
      response: { error: { message: 'The export could not be produced.' } },
    });
  });

  it('410s an EXPIRED row rather than calling it not-ready', async () => {
    // The difference is what tells the person whether to wait or to start again.
    const { service } = makeService([[row({ status: 'EXPIRED', file_id: null })]]);
    await expect(service.downloadUrl(TENANT, USER, EXPORT)).rejects.toBeInstanceOf(GoneException);
  });

  it('410s a READY row whose 7-day window has closed', async () => {
    const { service, files } = makeService([[row({ expires_at: PAST })]]);
    await expect(service.downloadUrl(TENANT, USER, EXPORT)).rejects.toMatchObject({
      status: 410,
      response: { error: { code: 'COS-PDPA-007' } },
    });
    // Never asks File Service for an object it has already told the caller is gone.
    expect(files.getSignedUrl).not.toHaveBeenCalled();
  });

  it('404s with "try again shortly" while ClamAV has not cleared the archive', async () => {
    // getSignedUrl returns null for both 404 and 409 FILE_NOT_CLEAN. A just-finished upload is
    // briefly PENDING_SCAN — a wait, not a fault, and the message has to say so.
    const { service, files } = makeService([[row()]]);
    (files.getSignedUrl as jest.Mock).mockResolvedValue(null);
    await expect(service.downloadUrl(TENANT, USER, EXPORT)).rejects.toMatchObject({
      status: 404,
      response: { error: { code: 'COS-PDPA-006' } },
    });
  });

  it('rejects a non-UUID tenant before any SQL runs', async () => {
    const { service, calls } = makeService();
    await expect(service.downloadUrl("'; DROP TABLE--", USER, EXPORT)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe('lifecycle', () => {
  it('closes the Prisma handle when no workflow was ever started', async () => {
    const { service } = makeService();
    await service.onModuleDestroy();
    expect(prismaMock.$disconnect).toHaveBeenCalled();
    expect(connectionMock.close).not.toHaveBeenCalled();
  });

  it('closes the memoised Temporal connection once one has been opened', async () => {
    const { service } = makeService([[row({ status: 'PENDING', file_id: null })]]);
    await service.request(REQUEST);
    await service.onModuleDestroy();

    expect(prismaMock.$disconnect).toHaveBeenCalled();
    expect(connectionMock.close).toHaveBeenCalled();
  });
});
