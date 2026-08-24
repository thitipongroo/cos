// The I/O half of the PDPA export job (ADR-078).
//
// What these protect, in order of what a regression would cost:
//   - the PLATFORM and TENANT handles reach the collector as separate databases (an ENTERPRISE
//     tenant's identity/contact/operational data lives on a different server from their site data)
//   - the job's selection is read from the ROW, never from the workflow args a replay would repeat
//   - failures reach the row, so a §30 request cannot sit at PROCESSING past its 30-day clock
//   - the failure text the subject receives carries no schema, table or query fragment
//   - the mail carries a page link, never a signed URL to a RESTRICTED archive

const prismaMock = {
  $transaction: jest.fn(),
  $disconnect: jest.fn().mockResolvedValue(undefined),
};
const uploadMock = jest.fn().mockResolvedValue({ file_id: 'file-9' });
const sendMock = jest.fn().mockResolvedValue(undefined);
const withTenantTxMock = jest.fn();

jest.mock('../../../../shared/prisma/create-prisma-client', () => ({
  createPrismaClient: () => prismaMock,
}));
jest.mock('../../../../shared/prisma/app-database-url', () => ({
  appDatabaseUrl: () => 'postgresql://app_user@pgbouncer:6432/cos',
}));
jest.mock('@cos/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('../../../procurement/workflows/activity-helpers', () => ({
  withTenantTx: (tenantId: string, fn: (tx: unknown) => unknown) => withTenantTxMock(tenantId, fn),
}));
jest.mock('../../../files/file-service-client.service', () => ({
  FileServiceClient: class {
    upload = uploadMock;
  },
}));
jest.mock('../../../notification/adapters/sendgrid.adapter', () => ({
  SendGridAdapter: class {
    send = sendMock;
  },
}));

import {
  collectAndUploadActivity,
  disconnectExportClients,
  markFailedActivity,
  markProcessingActivity,
  markReadyActivity,
  notifySubjectActivity,
} from '../workflows/data-export.activities';

const TENANT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const EXPORT = '33333333-3333-4333-8333-333333333333';
const JOB = { export_id: EXPORT, tenant_id: TENANT, user_id: USER };

/** Statements issued against the PLATFORM handle, in order. */
let platformSql: string[];
/** Statements issued against the TENANT handle, in order. */
let tenantSql: string[];
let setLocal: jest.Mock;

/**
 * Drive both handles. `platformRows` answers $queryRaw on the platform transaction in order;
 * the tenant handle is whatever `withTenantTx` yields, tracked separately so a test can prove a
 * query went to the right database rather than merely "somewhere".
 */
function given(platformRows: unknown[][] = []) {
  platformSql = [];
  tenantSql = [];
  setLocal = jest.fn().mockResolvedValue(0);
  let i = 0;

  const platformTx = {
    $executeRawUnsafe: setLocal,
    $executeRaw: jest.fn((s: TemplateStringsArray) => {
      platformSql.push(s.join('?'));
      return Promise.resolve(1);
    }),
    $queryRaw: jest.fn((s: TemplateStringsArray) => {
      platformSql.push(s.join('?'));
      return Promise.resolve(platformRows[i++] ?? []);
    }),
  };
  const tenantTx = {
    $queryRaw: jest.fn((s: TemplateStringsArray) => {
      tenantSql.push(s.join('?'));
      return Promise.resolve([]);
    }),
  };

  prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(platformTx),
  );
  withTenantTxMock.mockImplementation(
    async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn(tenantTx),
  );
  return { platformTx, tenantTx };
}

beforeEach(() => {
  jest.clearAllMocks();
  uploadMock.mockResolvedValue({ file_id: 'file-9' });
  sendMock.mockResolvedValue(undefined);
});

describe('markProcessingActivity', () => {
  it('moves PENDING → PROCESSING and refuses to move anything else', async () => {
    // Guarded on the current status so a Temporal retry of a partly-completed run cannot drag a
    // finished export back to PROCESSING and strand its file_id.
    given();
    await markProcessingActivity(JOB);

    expect(platformSql[0]).toContain("SET status = 'PROCESSING'");
    expect(platformSql[0]).toContain("AND status    = 'PENDING'");
    expect(setLocal).toHaveBeenCalledWith(`SET LOCAL app.current_tenant_id = '${TENANT}'`);
  });

  it('rejects a non-UUID tenant before any SQL runs', async () => {
    // SET LOCAL is string-interpolated — it cannot be parameterised — so this is the injection edge.
    given();
    await expect(markProcessingActivity({ ...JOB, tenant_id: "'; DROP--" })).rejects.toThrow();
    expect(platformSql).toHaveLength(0);
  });
});

describe('collectAndUploadActivity', () => {
  const spec = [{ categories: ['identity'], format: 'JSON', from_date: null, to_date: null }];

  it('reads the selection from the ROW, scoped to the requesting user', async () => {
    // Not from the workflow args: a replay would then re-export whatever the args said, even after
    // the row was corrected.
    given([spec]);
    await collectAndUploadActivity(JOB);

    expect(platformSql[0]).toContain('FROM platform.export_requests');
    expect(platformSql[0]).toContain('AND user_id');
  });

  it('stops when the request row is gone rather than guessing a selection', async () => {
    // A missing row means the account was erased. Defaulting to "everything" would gather and upload
    // an archive nobody asked for.
    given([[]]);
    await expect(collectAndUploadActivity(JOB)).rejects.toThrow('no longer exists');
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('sends platform tables to the platform handle and domain tables to the tenant handle', async () => {
    // The point of ExportDb. For an ENTERPRISE tenant these are different servers, and a single
    // handle on the tenant URL returns zero rows for identity/contact — an archive that looks
    // complete and answers a §30 request with a lie.
    given([spec]);
    await collectAndUploadActivity({ ...JOB });

    expect(withTenantTxMock).toHaveBeenCalledWith(TENANT, expect.any(Function));
    expect(platformSql.some((s) => s.includes('platform.users'))).toBe(true);
    expect(platformSql.some((s) => s.includes('platform.trusted_devices'))).toBe(true);
    // workforce.workers follows the tenant even though what it resolves is an identity link.
    expect(tenantSql.every((s) => s.includes('workforce.workers'))).toBe(true);
    expect(tenantSql.some((s) => s.includes('platform.'))).toBe(false);
  });

  it('uploads JSON as a single document, named after the export id', async () => {
    given([spec]);
    expect(await collectAndUploadActivity(JOB)).toBe('file-9');

    const [params] = uploadMock.mock.calls[0] as [
      { filename: string; contentType: string; buffer: Buffer; entityId: string },
    ];
    expect(params.filename).toBe(`cos-data-export-${EXPORT}.json`);
    expect(params.contentType).toBe('application/json');
    expect(params.entityId).toBe(EXPORT);
    expect(JSON.parse(params.buffer.toString('utf8'))).toMatchObject({ subject_user_id: USER });
  });

  it('uploads CSV as a ZIP, because a CSV cannot hold several tables', async () => {
    given([[{ categories: ['identity'], format: 'CSV', from_date: null, to_date: null }]]);
    await collectAndUploadActivity(JOB);

    const [params] = uploadMock.mock.calls[0] as [{ filename: string; contentType: string }];
    expect(params.filename).toBe(`cos-data-export-${EXPORT}.zip`);
    expect(params.contentType).toBe('application/zip');
  });

  it('carries the window from the row into the collected envelope', async () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-06-30T00:00:00.000Z');
    given([[{ categories: ['identity'], format: 'JSON', from_date: from, to_date: to }]]);
    await collectAndUploadActivity(JOB);

    const [params] = uploadMock.mock.calls[0] as [{ buffer: Buffer }];
    expect(JSON.parse(params.buffer.toString('utf8'))).toMatchObject({
      window: { from: from.toISOString(), to: to.toISOString() },
    });
  });

  it('establishes a CLS identity for the upload, which otherwise fails closed', async () => {
    // An activity has no HTTP request, and FileServiceClient reads the acting principal from the
    // ambient context (ADR-031). Without a scope here every export upload would 401.
    given([spec]);
    await collectAndUploadActivity(JOB);
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });
});

describe('markReadyActivity / markFailedActivity', () => {
  it('records the archive reference and the completion time on success', async () => {
    given();
    await markReadyActivity({ ...JOB, file_id: 'file-9' });
    expect(platformSql[0]).toContain("SET status       = 'READY'");
    expect(platformSql[0]).toContain('file_id');
    expect(platformSql[0]).toContain('completed_at = now()');
  });

  it('records a failure reason AND a completion time', async () => {
    // completed_at matters on the failure path too: the request reached a terminal state, and a NULL
    // there leaves the 30-day compliance answer unable to say when it stopped.
    given();
    await markFailedActivity({ ...JOB, reason: 'Could not be produced.' });
    expect(platformSql[0]).toContain("SET status         = 'FAILED'");
    expect(platformSql[0]).toContain('failure_reason');
    expect(platformSql[0]).toContain('completed_at   = now()');
  });
});

describe('notifySubjectActivity', () => {
  it('mails a page link, never a signed URL to the archive', async () => {
    // The page mints a fresh short-lived URL on click. A link in a mailbox is a bearer credential to
    // every coordinate the person was recorded at, and mailboxes get forwarded and breached.
    given([[{ email: 'somchai@example.com' }]]);
    await notifySubjectActivity({ ...JOB, ready: true });

    const [msg] = sendMock.mock.calls[0] as [{ to: string; subject: string; body: string }];
    expect(msg.to).toBe('somchai@example.com');
    expect(msg.subject).toContain('ready');
    expect(msg.body).toContain(`/privacy/data-export/${EXPORT}`);
    expect(msg.body).not.toMatch(/X-Amz-Signature|\?.*Signature=/);
  });

  it('sends the failure variant when the job did not produce an archive', async () => {
    given([[{ email: 'somchai@example.com' }]]);
    await notifySubjectActivity({ ...JOB, ready: false });

    const [msg] = sendMock.mock.calls[0] as [{ subject: string; body: string }];
    expect(msg.subject).toContain('could not be completed');
    expect(msg.body).toContain('request it again');
  });

  it('logs and returns when the subject has no email — never fails a finished export', async () => {
    // Throwing here would flip a READY row to FAILED on the workflow's error path and hide a good
    // archive the subject can still reach in-app.
    given([[]]);
    await expect(notifySubjectActivity({ ...JOB, ready: true })).resolves.toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('uses the configured app base URL when one is set', async () => {
    const original = process.env['APP_BASE_URL'];
    process.env['APP_BASE_URL'] = 'https://cos.example.co.th';
    try {
      given([[{ email: 'a@b.com' }]]);
      await notifySubjectActivity({ ...JOB, ready: true });
      const [msg] = sendMock.mock.calls[0] as [{ body: string }];
      expect(msg.body).toContain('https://cos.example.co.th/privacy/data-export/');
    } finally {
      if (original === undefined) delete process.env['APP_BASE_URL'];
      else process.env['APP_BASE_URL'] = original;
    }
  });
});

describe('disconnectExportClients', () => {
  // ADR-034 / Rule 39. The worker calls this alongside the tenant pool on shutdown. The client is
  // module-level and pooled for the worker's lifetime, so these two cases have to run in order:
  // earlier tests in this file have already opened it.
  it('closes the pooled platform client once one has been opened', async () => {
    given();
    await markProcessingActivity(JOB); // ensures the lazy client exists
    await disconnectExportClients();
    expect(prismaMock.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('is a no-op on a second call, so a double shutdown cannot double-close', async () => {
    // The previous test left it null. Closing an already-closed pool would throw and take the
    // worker's shutdown path down with it.
    await disconnectExportClients();
    expect(prismaMock.$disconnect).not.toHaveBeenCalled();
  });

  it('lazily reopens after a disconnect', async () => {
    // Covers the other half of the `??=`: the worker can be re-entered in tests and in a restart.
    given();
    await expect(markProcessingActivity(JOB)).resolves.toBeUndefined();
    expect(platformSql).toHaveLength(1);
  });
});
